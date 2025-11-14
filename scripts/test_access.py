#!/usr/bin/env python3
"""
Test if we can access the Gemini URLs
"""
import asyncio
from patchright.async_api import async_playwright


async def test_url(url):
    print(f"\nTesting: {url}")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )

        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        )

        page = await context.new_page()

        # Go to page
        response = await page.goto(url, wait_until='load', timeout=30000)

        print(f"Status: {response.status}")
        print(f"URL after redirects: {page.url}")

        # Wait a bit
        await asyncio.sleep(2)

        # Try to get content
        try:
            content = await page.content()
            print(f"HTML length: {len(content)} bytes")
            print(f"HTML preview (first 500 chars):")
            print(content[:500])

            # Save it
            with open(f'test_output_{url.split("/")[-1]}.html', 'w') as f:
                f.write(content)
                print(f"\nSaved to: test_output_{url.split('/')[-1]}.html")

        except Exception as e:
            print(f"Error getting content: {e}")

        await browser.close()


async def main():
    urls = [
        "https://g.co/gemini/share/c9cba1e9858a",
        "https://g.co/gemini/share/4079b2f26c6f"
    ]

    for url in urls:
        await test_url(url)


if __name__ == "__main__":
    asyncio.run(main())
