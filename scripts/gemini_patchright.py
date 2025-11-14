#!/usr/bin/env python3
"""
Gemini Chat History Extractor using Patchright (Stealth Playwright)
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from patchright.async_api import async_playwright
from bs4 import BeautifulSoup


async def extract_gemini_chat(url: str, output_dir: str = "output") -> dict:
    """Extract chat history from a Gemini shared chat URL."""
    print(f"Fetching chat from: {url}")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser with patchright (stealth mode is automatic)
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--disable-web-security'
            ]
        )

        # Create new page with ignore https errors
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()

        try:
            # Navigate to the URL
            print(f"Navigating to {url}...")
            response = await page.goto(url, wait_until='domcontentloaded', timeout=60000)

            print(f"Response status: {response.status if response else 'unknown'}")

            # Wait for content
            await asyncio.sleep(3)

            # Try to scroll to load content (may fail if page crashed/403)
            try:
                await page.evaluate("() => { window.scrollTo(0, document.body.scrollHeight / 2); }")
                await asyncio.sleep(1)
                await page.evaluate("() => { window.scrollTo(0, document.body.scrollHeight); }")
                await asyncio.sleep(2)
            except Exception as e:
                print(f"Could not execute JS (likely due to 403/crash): {e}")

            # Get page content
            html_content = await page.content()
            print(f"HTML length: {len(html_content)}")

            # Try to take screenshot for debugging
            url_hash = url.split('/')[-1]
            try:
                screenshot_file = output_path / f"gemini_chat_{url_hash}_screenshot.png"
                await page.screenshot(path=str(screenshot_file))
                print(f"Screenshot saved to: {screenshot_file}")
            except Exception as e:
                print(f"Could not take screenshot: {e}")

            # Save debug HTML
            html_debug_file = output_path / f"gemini_chat_{url_hash}_debug.html"
            with open(html_debug_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f"Debug HTML saved to: {html_debug_file}")

            # Parse HTML
            soup = BeautifulSoup(html_content, 'html.parser')

            # Look for the title to see if we got the right page
            title = soup.find('title')
            print(f"Page title: {title.text if title else 'No title found'}")

            # Extract messages
            messages = []

            # Get all text content
            body = soup.find('body')
            if body:
                # Extract all meaningful text
                all_text = body.get_text(separator='\n', strip=True)
                print(f"Total text length: {len(all_text)}")
                print(f"First 500 chars: {all_text[:500]}")

                # Try to find conversation structure
                # Look for common patterns
                for elem in soup.find_all(['div', 'p', 'article', 'section']):
                    text = elem.get_text(strip=True)
                    if text and len(text) > 30:
                        # Check if this looks like a message
                        classes = ' '.join(elem.get('class', []))
                        if any(keyword in classes.lower() for keyword in ['message', 'chat', 'conversation', 'turn', 'response', 'query']):
                            messages.append({
                                'index': len(messages),
                                'role': 'unknown',
                                'content': text,
                                'element': elem.name,
                                'classes': classes
                            })

            # Save results
            chat_data = {
                'url': url,
                'timestamp': datetime.now().isoformat(),
                'status_code': response.status if response else None,
                'page_title': title.text if title else None,
                'message_count': len(messages),
                'messages': messages,
                'full_text_preview': all_text[:2000] if 'all_text' in locals() else None
            }

            output_file = output_path / f"gemini_chat_{url_hash}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, indent=2, ensure_ascii=False)

            print(f"Extracted {len(messages)} messages")
            print(f"Saved to: {output_file}")

            return chat_data

        finally:
            await browser.close()


async def main():
    """Main function."""
    # URLs to extract
    urls = [
        "https://g.co/gemini/share/c9cba1e9858a",
        "https://g.co/gemini/share/4079b2f26c6f"
    ]

    if len(sys.argv) > 1:
        urls = sys.argv[1:]

    print(f"Extracting chat history from {len(urls)} URL(s)...")
    print("=" * 60)

    results = []
    for url in urls:
        try:
            result = await extract_gemini_chat(url)
            results.append(result)
            print("=" * 60)
        except Exception as e:
            print(f"Error processing {url}: {e}")
            import traceback
            traceback.print_exc()
            results.append({"error": str(e), "url": url})
            print("=" * 60)

    # Save summary
    output_path = Path("output")
    output_path.mkdir(parents=True, exist_ok=True)

    summary_file = output_path / f"extraction_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_urls': len(urls),
            'results': results
        }, f, indent=2, ensure_ascii=False)

    print(f"\nSummary saved to: {summary_file}")
    print(f"\nProcessed {len(urls)} URL(s)!")


if __name__ == "__main__":
    asyncio.run(main())
