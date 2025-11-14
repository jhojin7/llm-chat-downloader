#!/usr/bin/env python3
"""
Simplified Gemini Chat History Extractor using Playwright

This script extracts chat history from Gemini shared URLs using playwright-stealth.
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup


async def extract_gemini_chat(url: str, output_dir: str = "output") -> dict:
    """Extract chat history from a Gemini shared chat URL."""
    print(f"Fetching chat from: {url}")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        # Launch browser with stealth settings
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ]
        )

        # Create context with realistic settings
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
            ignore_https_errors=True,
        )

        # Inject anti-detection scripts
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            window.chrome = {
                runtime: {}
            };
        """)

        page = await context.new_page()

        try:
            # Navigate to the URL
            print(f"Navigating to {url}...")
            response = await page.goto(url, wait_until='networkidle', timeout=60000)

            print(f"Response status: {response.status if response else 'unknown'}")

            # Wait for page to load
            await asyncio.sleep(3)

            # Try to wait for specific content
            try:
                await page.wait_for_selector('body', timeout=10000)
            except:
                pass

            # Scroll to load dynamic content
            await page.evaluate("""
                async () => {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    window.scrollTo(0, document.body.scrollHeight / 2);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    window.scrollTo(0, document.body.scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    window.scrollTo(0, 0);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            """)

            # Get page content
            html_content = await page.content()
            print(f"HTML length: {len(html_content)}")

            # Save debug HTML
            url_hash = url.split('/')[-1]
            html_debug_file = output_path / f"gemini_chat_{url_hash}_debug.html"
            with open(html_debug_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f"Debug HTML saved to: {html_debug_file}")

            # Parse HTML
            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract messages
            messages = []

            # Try multiple selectors for Gemini chat structure
            selectors = [
                'message-content',
                'model-response',
                'user-query',
                '[data-test-id*="message"]',
                '[class*="conversation"]',
                '[class*="message"]',
                '[class*="chat"]',
                'div[role="article"]',
            ]

            for selector in selectors:
                found_elements = soup.select(f'[class*="{selector}"]') if not selector.startswith('[') else soup.select(selector)
                if found_elements:
                    print(f"Found {len(found_elements)} elements with selector: {selector}")
                    for idx, elem in enumerate(found_elements):
                        text = elem.get_text(strip=True)
                        if text and len(text) > 10:  # Skip very short texts
                            messages.append({
                                'index': len(messages),
                                'role': 'unknown',
                                'content': text,
                                'selector': selector
                            })
                    if messages:
                        break

            # If no messages found, try extracting all meaningful text blocks
            if not messages:
                print("No specific message elements found, extracting text blocks...")
                text_elements = soup.find_all(['p', 'div', 'span'])
                for elem in text_elements:
                    text = elem.get_text(strip=True)
                    if text and len(text) > 20 and text not in [m['content'] for m in messages]:
                        messages.append({
                            'index': len(messages),
                            'role': 'unknown',
                            'content': text,
                            'selector': 'text_extraction'
                        })

            # Save results
            chat_data = {
                'url': url,
                'timestamp': datetime.now().isoformat(),
                'status_code': response.status if response else None,
                'message_count': len(messages),
                'messages': messages,
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
    """Main function to extract chat history from multiple URLs."""

    # URLs to extract
    urls = [
        "https://g.co/gemini/share/c9cba1e9858a",
        "https://g.co/gemini/share/4079b2f26c6f"
    ]

    # Allow custom URLs from command line
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

    # Save combined results
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
