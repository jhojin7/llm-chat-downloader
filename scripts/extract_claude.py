#!/usr/bin/env python3
"""
Claude Chat Extractor - Extracts complete conversation history from Claude share links

SETUP INSTRUCTIONS:
1. Use uv for Python environment management (project requirement)
   $ cd llm-chat-downloader
   $ uv venv
   $ uv pip install -r scripts/requirements.txt
   $ uv run playwright install chromium

2. Run the script:
   $ uv run python scripts/extract_claude.py [URL1] [URL2] ...

TECHNICAL DETAILS:
- Uses Patchright (patched Playwright) to avoid detection
- Scrolls page to load all content (lazy-loaded messages)
- Extracts structured data: user queries + assistant responses
- Preserves markdown formatting in responses
- Saves: JSON (structured data), HTML (raw page), PNG (screenshot)
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from patchright.async_api import async_playwright
from bs4 import BeautifulSoup
from markdownify import markdownify as md


async def extract_claude_chat(url: str, output_dir: str = "output") -> dict:
    """Extract chat history from Claude share URL."""
    print(f"\n{'=' * 60}")
    print(f"Extracting: {url}")
    print(f"{'=' * 60}\n")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=True,  # Run in headless mode for stability
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
            ],
        )

        # Create context
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            ignore_https_errors=True,
        )

        page = await context.new_page()

        try:
            print(f"→ Loading page...")
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

            # Extract messages - Parse Claude conversation structure
            messages = []
            turn_idx = 0

            # Claude's shared chat pages use a specific structure
            # Look for message containers - Claude uses specific selectors

            # Strategy 1: Find messages by looking for common Claude DOM patterns
            # Claude share pages typically have message elements with specific attributes

            # Try to find all text content blocks that could be messages
            # Look for elements with 'font-user-message' or 'font-claude-message' classes
            user_messages = soup.find_all(class_=lambda x: x and 'font-user-message' in str(x))
            assistant_messages = soup.find_all(class_=lambda x: x and 'font-claude-message' in str(x))

            print(f"→ Found {len(user_messages)} user message elements")
            print(f"→ Found {len(assistant_messages)} assistant message elements")

            # Strategy 2: Look for alternating message pattern in the DOM
            # Find all potential message blocks
            message_blocks = []

            # Find all divs that might contain messages
            # Claude often uses divs with specific data attributes or classes
            for div in soup.find_all(['div', 'article']):
                # Check if this div contains substantial text
                text = div.get_text(separator=' ', strip=True)
                if len(text) < 20:  # Skip short texts
                    continue

                # Check if it might be a message by looking for indicators
                classes = div.get('class', [])
                class_str = ' '.join(classes) if classes else ''

                # Look for message-like content
                if any(indicator in text.lower()[:100] for indicator in ['hello', 'hi ', 'please', 'what', 'how', 'can you', 'i need', 'help']):
                    # This might be a user message
                    message_blocks.append({
                        'element': div,
                        'text': text,
                        'classes': class_str,
                        'likely_role': 'user'
                    })
                elif len(text) > 100:  # Longer texts might be assistant responses
                    message_blocks.append({
                        'element': div,
                        'text': text,
                        'classes': class_str,
                        'likely_role': 'assistant'
                    })

            # Strategy 3: Use semantic HTML structure
            # Look for elements that represent conversation turns
            main_content = soup.find('main') or soup.find('article') or soup.find(id='root') or soup.body

            if main_content:
                # Find direct children that might be message containers
                # This works for many chat interfaces
                potential_containers = main_content.find_all(['div', 'section', 'article'], recursive=False)

                for container in potential_containers:
                    # Look for nested elements that might contain actual messages
                    nested_divs = container.find_all('div', recursive=True)

                    for div in nested_divs:
                        text = div.get_text(separator='\n', strip=True)

                        # Only process if it has meaningful content
                        if not text or len(text) < 10:
                            continue

                        # Check if this looks like a distinct message
                        # (not just a container with lots of nested content)
                        child_texts = [child.get_text(strip=True) for child in div.find_all(recursive=False) if child.name]
                        if child_texts and len(' '.join(child_texts)) > len(text) * 0.8:
                            # This is mostly a container, skip it
                            continue

                        # Try to determine role based on content and structure
                        # (This is a heuristic approach for when specific selectors don't work)
                        is_code_heavy = len(div.find_all(['pre', 'code'])) > 0
                        is_long = len(text) > 150

                        # Alternate between user and assistant
                        # Start with user (most chats start with user input)
                        if len(messages) == 0:
                            role = 'user'
                        else:
                            # Alternate role from previous message
                            role = 'assistant' if messages[-1]['role'] == 'user' else 'user'

                        # Create message
                        msg = {
                            'index': len(messages),
                            'turn': turn_idx,
                            'role': role,
                            'content': text,
                        }

                        # For assistant messages, add markdown and links
                        if role == 'assistant':
                            content_markdown = md(str(div), heading_style='ATX').strip()
                            msg['content_markdown'] = content_markdown

                            # Extract links
                            links = []
                            for link in div.find_all('a', href=True):
                                link_text = link.get_text(strip=True)
                                href = link['href']
                                if link_text and href:
                                    links.append({'text': link_text, 'url': href})
                            if links:
                                msg['links'] = links

                        # Avoid duplicates
                        if not any(m['content'] == text for m in messages):
                            messages.append(msg)
                            print(f"  Turn {turn_idx} - {role.capitalize()}: {text[:80]}...")

                            if role == 'assistant':
                                turn_idx += 1

            # If we didn't find messages with the above strategies, try a simpler approach
            # Just extract all significant text blocks
            if len(messages) == 0:
                print("→ Using fallback extraction method")
                all_text_elements = soup.find_all(['p', 'div', 'span'])

                current_role = 'user'
                for elem in all_text_elements:
                    text = elem.get_text(separator='\n', strip=True)

                    if not text or len(text) < 20:
                        continue

                    # Avoid duplicates
                    if any(m['content'] == text for m in messages):
                        continue

                    msg = {
                        'index': len(messages),
                        'turn': turn_idx if current_role == 'user' else turn_idx,
                        'role': current_role,
                        'content': text,
                    }

                    if current_role == 'assistant':
                        msg['content_markdown'] = md(str(elem), heading_style='ATX').strip()

                    messages.append(msg)
                    print(f"  {current_role.capitalize()}: {text[:60]}...")

                    # Alternate roles
                    if current_role == 'user':
                        current_role = 'assistant'
                    else:
                        current_role = 'user'
                        turn_idx += 1

                    # Limit to reasonable number of messages
                    if len(messages) >= 50:
                        break

            print(f"→ Extracted {len(messages)} messages")

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

    # Check for API mode (single URL + output file specified)
    if len(sys.argv) == 3:
        # API mode: extract_claude.py <URL> <output_file>
        url = sys.argv[1]
        output_file = sys.argv[2]

        print("\n" + "=" * 60)
        print("CLAUDE CHAT EXTRACTOR - API MODE")
        print("=" * 60)
        print(f"URL: {url}")
        print(f"Output: {output_file}")

        # Extract to temporary directory
        result = await extract_claude_chat(url, output_dir="output")

        # Copy the result to the specified output file
        if "error" not in result:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"✓ Saved to: {output_file}\n")
        else:
            # Save error result
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"✗ Error saved to: {output_file}\n")

        return

    # Default URLs (Claude share links provided by user)
    urls = [
        "https://claude.ai/share/62bc6fc6-d53a-4f65-8ad3-f42bb8941952",
        "https://claude.ai/share/0cc98a15-99f4-4d9a-c7f9-ad8090575d67",
    ]

    # Allow custom URLs from command line
    if len(sys.argv) > 1:
        urls = sys.argv[1:]

    print("\n" + "=" * 60)
    print("CLAUDE CHAT EXTRACTOR")
    print("=" * 60)
    print(f"\nProcessing {len(urls)} URL(s)...")

    results = []
    for url in urls:
        result = await extract_claude_chat(url)
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
