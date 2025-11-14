#!/usr/bin/env python3
"""
Simple Gemini Chat Extractor - Works from your local machine

Since the URLs ARE accessible (you got 133 lines with curl), this script will work
when run from your local environment, not from this Docker container.
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from patchright.async_api import async_playwright
from bs4 import BeautifulSoup


async def extract_gemini_chat(url: str, output_dir: str = "output") -> dict:
    """Extract chat history from Gemini URL."""
    print(f"\n{'='*60}")
    print(f"Extracting: {url}")
    print(f"{'='*60}\n")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,  # Show browser so you can see what's happening
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )

        # Create context
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        )

        page = await context.new_page()

        try:
            print(f"→ Loading page...")
            response = await page.goto(url, wait_until='networkidle', timeout=60000)

            print(f"→ Status: {response.status}")
            print(f"→ Waiting for content to load...")

            # Wait for page to fully load
            await asyncio.sleep(5)

            # Get page content
            html = await page.content()
            print(f"→ HTML size: {len(html):,} bytes")

            # Save raw HTML for inspection
            url_hash = url.split('/')[-1]
            html_file = output_path / f"{url_hash}_raw.html"
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"→ Saved HTML: {html_file}")

            # Take screenshot
            screenshot_file = output_path / f"{url_hash}_screenshot.png"
            await page.screenshot(path=str(screenshot_file), full_page=True)
            print(f"→ Saved screenshot: {screenshot_file}")

            # Parse HTML
            soup = BeautifulSoup(html, 'html.parser')

            # Extract title
            title = soup.find('title')
            page_title = title.text if title else "No title"
            print(f"→ Page title: {page_title}")

            # Extract messages - try multiple strategies
            messages = []

            # Strategy 1: Look for common Gemini selectors
            selectors_to_try = [
                ('message-content', 'class contains'),
                ('model-response', 'class contains'),
                ('user-query', 'class contains'),
                ('conversation-turn', 'class contains'),
                ('[data-message-author]', 'attribute'),
                ('[role="article"]', 'role'),
            ]

            for selector, desc in selectors_to_try:
                if 'class contains' in desc:
                    elements = soup.select(f'[class*="{selector}"]')
                else:
                    elements = soup.select(selector)

                if elements:
                    print(f"→ Found {len(elements)} elements matching: {selector}")
                    for idx, elem in enumerate(elements):
                        text = elem.get_text(separator='\n', strip=True)
                        if text and len(text) > 20:
                            messages.append({
                                'index': len(messages),
                                'content': text,
                                'selector': selector,
                                'role': 'user' if 'user' in selector else 'assistant' if 'model' in selector else 'unknown'
                            })
                    if messages:
                        break

            # Strategy 2: If no messages found, extract all substantial text blocks
            if not messages:
                print("→ No specific message elements found, extracting text blocks...")
                for elem in soup.find_all(['p', 'div']):
                    text = elem.get_text(strip=True)
                    if text and len(text) > 30:
                        classes = ' '.join(elem.get('class', []))
                        messages.append({
                            'index': len(messages),
                            'content': text,
                            'element': elem.name,
                            'classes': classes
                        })

            print(f"→ Extracted {len(messages)} messages")

            # Create output data
            chat_data = {
                'url': url,
                'timestamp': datetime.now().isoformat(),
                'page_title': page_title,
                'status_code': response.status,
                'message_count': len(messages),
                'messages': messages
            }

            # Save JSON
            json_file = output_path / f"{url_hash}_chat.json"
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, indent=2, ensure_ascii=False)
            print(f"→ Saved JSON: {json_file}")

            # Print summary
            print(f"\n{'='*60}")
            print(f"✓ SUCCESS")
            print(f"  Messages extracted: {len(messages)}")
            print(f"  Output files:")
            print(f"    - {json_file}")
            print(f"    - {html_file}")
            print(f"    - {screenshot_file}")
            print(f"{'='*60}\n")

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
        "https://g.co/gemini/share/4079b2f26c6f"
    ]

    # Allow custom URLs from command line
    if len(sys.argv) > 1:
        urls = sys.argv[1:]

    print("\n" + "="*60)
    print("GEMINI CHAT EXTRACTOR")
    print("="*60)
    print(f"\nProcessing {len(urls)} URL(s)...")

    results = []
    for url in urls:
        result = await extract_gemini_chat(url)
        results.append(result)

    # Save summary
    output_path = Path("output")
    output_path.mkdir(parents=True, exist_ok=True)

    summary_file = output_path / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_urls': len(urls),
            'successful': sum(1 for r in results if 'error' not in r),
            'failed': sum(1 for r in results if 'error' in r),
            'results': results
        }, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Summary saved: {summary_file}\n")


if __name__ == "__main__":
    asyncio.run(main())
