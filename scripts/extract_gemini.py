#!/usr/bin/env python3
"""
Gemini Chat Extractor - Extracts complete conversation history from Gemini share links

IMPORTANT NOTES:
- Gemini share pages typically show only ONE conversation turn (Q&A pair)
- Some share links MAY contain multiple turns - this script extracts all visible turns
- The script scrolls to load any lazy-loaded content

SETUP INSTRUCTIONS:
1. Use uv for Python environment management (project requirement)
   $ cd llm-chat-downloader
   $ uv venv
   $ uv pip install -r scripts/requirements.txt
   $ uv run playwright install chromium

2. Run the script:
   $ uv run python scripts/extract_gemini.py [URL1] [URL2] ...

TECHNICAL DETAILS:
- Uses Patchright (patched Playwright) to avoid detection
- Scrolls page to load all content (lazy-loaded turns)
- Extracts structured data: user queries + assistant responses
- Preserves markdown formatting in responses
- Saves: JSON (structured data), HTML (raw page), PNG (screenshot)

RECENT CHANGES (2025-11-14):
- Added automatic scrolling to load all conversation turns
- Improved extraction to parse actual Gemini DOM structure (share-turn-viewer)
- Now extracts separate user/assistant messages with role labels
- Preserves message ordering and turn numbering
- Added markdown conversion: assistant responses now include both plain text and markdown
- Hyperlinks preserved in markdown format: [link text](url)
- Uses markdownify library (alternative: html2text can also be used)
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from patchright.async_api import async_playwright
from bs4 import BeautifulSoup
from markdownify import markdownify as md


async def extract_gemini_chat(url: str, output_dir: str = "output") -> dict:
    """Extract chat history from Gemini URL."""
    print(f"\n{'=' * 60}")
    print(f"Extracting: {url}")
    print(f"{'=' * 60}\n")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser
        # FIXED: Changed from headless=False to True to prevent manual browser closure issues
        browser = await p.chromium.launch(
            headless=True,  # Run in headless mode for stability
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )

        # Create context
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )

        page = await context.new_page()

        try:
            print(f"→ Loading page...")
            # FIXED: Changed wait_until from 'networkidle' to 'domcontentloaded'
            # Reason: 'networkidle' was timing out after 60s on Gemini share pages
            # 'domcontentloaded' works better for dynamically loaded content
            response = await page.goto(
                url, wait_until="domcontentloaded", timeout=30000
            )

            print(f"→ Status: {response.status}")
            print(f"→ Waiting for content to load...")

            # Wait for page to fully load
            await asyncio.sleep(5)

            # Get page content
            html = await page.content()
            print(f"→ HTML size: {len(html):,} bytes")

            # Save raw HTML for inspection
            url_hash = url.split("/")[-1]
            html_file = output_path / f"{url_hash}_raw.html"
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"→ Saved HTML: {html_file}")

            # Take screenshot
            screenshot_file = output_path / f"{url_hash}_screenshot.png"
            await page.screenshot(path=str(screenshot_file), full_page=True)
            print(f"→ Saved screenshot: {screenshot_file}")

            # Parse HTML
            soup = BeautifulSoup(html, "html.parser")

            # Extract title
            title = soup.find("title")
            page_title = title.text if title else "No title"
            print(f"→ Page title: {page_title}")

            # Scroll to bottom to load all messages (lazy-loaded content)
            print(f"→ Scrolling to load all content...")
            last_height = await page.evaluate("document.body.scrollHeight")
            scroll_attempts = 0
            max_scrolls = 15  # Increased for potentially long conversations

            while scroll_attempts < max_scrolls:
                # Scroll to bottom
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1.5)  # Wait for content to load

                # Check if new content loaded
                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height
                scroll_attempts += 1
                print(f"  Scroll #{scroll_attempts}: height={new_height}px")

            print(f"→ Scrolling complete after {scroll_attempts} attempts")

            # Get updated HTML after scrolling
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")

            # Extract messages - Parse conversation turns structure
            messages = []

            # Find all conversation turns (share-turn-viewer elements)
            turn_viewers = soup.find_all("share-turn-viewer")
            print(f"→ Found {len(turn_viewers)} conversation turns")

            for turn_idx, turn in enumerate(turn_viewers):
                # Extract user query
                user_query = turn.find("user-query")
                if user_query:
                    query_text_elem = user_query.find("div", class_="query-text")
                    if query_text_elem:
                        query_text = query_text_elem.get_text(
                            separator="\n", strip=True
                        )
                        if query_text:
                            messages.append(
                                {
                                    "index": len(messages),
                                    "turn": turn_idx,
                                    "role": "user",
                                    "content": query_text,
                                }
                            )
                            print(f"  Turn {turn_idx} - User: {query_text[:80]}...")

                # Extract assistant response
                message_content = turn.find("message-content")
                if message_content:
                    # Get the markdown div
                    markdown_div = message_content.find("div", class_="markdown")
                    if markdown_div:
                        # Convert HTML to markdown (preserves links and formatting)
                        response_markdown = md(str(markdown_div), heading_style="ATX")

                        # Also extract plain text for backward compatibility
                        response_text = markdown_div.get_text(
                            separator="\n", strip=True
                        )

                        # Extract hyperlinks separately for reference
                        links = []
                        for link in markdown_div.find_all("a", href=True):
                            link_text = link.get_text(strip=True)
                            href = link["href"]
                            if link_text and href:
                                links.append({"text": link_text, "url": href})

                        if response_markdown:
                            msg = {
                                "index": len(messages),
                                "turn": turn_idx,
                                "role": "assistant",
                                "content": response_text,  # Plain text for backward compatibility
                                "content_markdown": response_markdown.strip(),  # Markdown with links preserved
                            }
                            if links:
                                msg["links"] = (
                                    links  # Separate links array for easy reference
                                )
                            messages.append(msg)
                            link_count = len(links)
                            print(
                                f"  Turn {turn_idx} - Assistant: {response_text[:80]}... [{link_count} links]"
                            )

            print(
                f"→ Extracted {len(messages)} messages from {len(turn_viewers)} turns"
            )

            # Create output data
            chat_data = {
                "url": url,
                "timestamp": datetime.now().isoformat(),
                "page_title": page_title,
                "status_code": response.status,
                "message_count": len(messages),
                "messages": messages,
            }

            # Save JSON
            json_file = output_path / f"{url_hash}_chat.json"
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(chat_data, f, indent=2, ensure_ascii=False)
            print(f"→ Saved JSON: {json_file}")

            # Print summary
            print(f"\n{'=' * 60}")
            print(f"✓ SUCCESS")
            print(f"  Messages extracted: {len(messages)}")
            print(f"  Output files:")
            print(f"    - {json_file}")
            print(f"    - {html_file}")
            print(f"    - {screenshot_file}")
            print(f"{'=' * 60}\n")

            return chat_data

        except Exception as e:
            print(f"\n✗ ERROR: {e}")
            import traceback

            traceback.print_exc()
            return {"error": str(e), "url": url}

        finally:
            await browser.close()


async def main():
    """Main function."""

    # Default URLs
    urls = [
        "https://g.co/gemini/share/c9cba1e9858a",
        "https://g.co/gemini/share/4079b2f26c6f",
    ]

    # Allow custom URLs from command line
    if len(sys.argv) > 1:
        urls = sys.argv[1:]

    print("\n" + "=" * 60)
    print("GEMINI CHAT EXTRACTOR")
    print("=" * 60)
    print(f"\nProcessing {len(urls)} URL(s)...")

    results = []
    for url in urls:
        result = await extract_gemini_chat(url)
        results.append(result)

    # Save summary
    output_path = Path("output")
    output_path.mkdir(parents=True, exist_ok=True)

    summary_file = (
        output_path / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(
            {
                "timestamp": datetime.now().isoformat(),
                "total_urls": len(urls),
                "successful": sum(1 for r in results if "error" not in r),
                "failed": sum(1 for r in results if "error" in r),
                "results": results,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"\n✓ Summary saved: {summary_file}\n")


if __name__ == "__main__":
    asyncio.run(main())
