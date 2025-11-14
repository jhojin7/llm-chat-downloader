#!/usr/bin/env python3
"""
Gemini Chat History Extractor using Crawl4AI

This script extracts user and assistant chat history from Gemini shared chat URLs.
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy, LLMExtractionStrategy
from bs4 import BeautifulSoup


async def extract_gemini_chat(url: str, output_dir: str = "output") -> dict:
    """
    Extract chat history from a Gemini shared chat URL.

    Args:
        url: The Gemini shared chat URL
        output_dir: Directory to save the extracted chat history

    Returns:
        Dictionary containing chat messages
    """
    print(f"Fetching chat from: {url}")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Use stealth mode and more realistic browser settings
    async with AsyncWebCrawler(
        verbose=True,
        headless=True,
        browser_type="chromium",
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ) as crawler:
        # Crawl the page with longer wait time
        result = await crawler.arun(
            url=url,
            bypass_cache=True,
            js_code=[
                "await new Promise(resolve => setTimeout(resolve, 2000));",
                "window.scrollTo(0, document.body.scrollHeight);",
                "await new Promise(resolve => setTimeout(resolve, 1000));",
            ],
            delay_before_return_html=5.0,  # Wait longer for content to load
            wait_for_selector="body",
            page_timeout=60000
        )

        if not result.success:
            print(f"Failed to crawl {url}: {result.error_message}")
            return {"error": result.error_message, "url": url}

        print(f"Response status: {result.status_code if hasattr(result, 'status_code') else 'unknown'}")
        print(f"HTML length: {len(result.html) if result.html else 0}")
        print(f"Final URL: {result.url if hasattr(result, 'url') else 'unknown'}")

        # Save raw HTML for debugging
        url_hash = url.split('/')[-1]
        html_debug_file = output_path / f"gemini_chat_{url_hash}_debug.html"
        with open(html_debug_file, 'w', encoding='utf-8') as f:
            f.write(result.html if result.html else "No HTML content")
        print(f"Debug HTML saved to: {html_debug_file}")

        # Parse the HTML content
        soup = BeautifulSoup(result.html, 'html.parser')

        # Extract chat messages
        messages = []

        # Try different selectors for Gemini chat structure
        # Gemini typically uses specific classes for messages
        selectors = [
            '.conversation-turn',
            '[class*="message"]',
            '[class*="chat"]',
            '[data-message-author]',
            '.model-response-text',
            '.user-query'
        ]

        # Try to find message containers
        message_elements = []
        for selector in selectors:
            found = soup.select(selector)
            if found:
                print(f"Found {len(found)} elements with selector: {selector}")
                message_elements = found
                break

        # If we still don't have messages, try a more general approach
        if not message_elements:
            print("Trying general text extraction...")
            # Look for any text content in the page
            main_content = soup.find('main') or soup.find('body')
            if main_content:
                # Extract all text blocks
                text_blocks = main_content.find_all(['p', 'div', 'span'])
                message_elements = [block for block in text_blocks if block.get_text(strip=True)]

        # Process found elements
        for idx, element in enumerate(message_elements):
            text = element.get_text(strip=True)
            if text:
                # Try to determine if it's a user or assistant message
                classes = ' '.join(element.get('class', []))
                role = 'assistant'  # Default

                if any(keyword in classes.lower() for keyword in ['user', 'prompt', 'query']):
                    role = 'user'
                elif any(keyword in classes.lower() for keyword in ['model', 'response', 'assistant']):
                    role = 'assistant'

                messages.append({
                    'index': idx,
                    'role': role,
                    'content': text,
                    'element_class': classes
                })

        # If we got very few messages, also save the markdown content
        if len(messages) < 5:
            print("Low message count, including markdown extraction...")
            markdown_text = result.markdown

            # Try to split by common patterns
            if markdown_text:
                # Split by common delimiters
                splits = markdown_text.split('\n\n')
                for idx, text_block in enumerate(splits):
                    if text_block.strip():
                        messages.append({
                            'index': len(messages),
                            'role': 'unknown',
                            'content': text_block.strip(),
                            'source': 'markdown'
                        })

        # Create result object
        chat_data = {
            'url': url,
            'timestamp': datetime.now().isoformat(),
            'message_count': len(messages),
            'messages': messages,
            'raw_markdown': result.markdown[:5000] if result.markdown else None,  # First 5000 chars for reference
        }

        # Save to file
        output_file = output_path / f"gemini_chat_{url_hash}.json"

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(chat_data, f, indent=2, ensure_ascii=False)

        print(f"Extracted {len(messages)} messages")
        print(f"Saved to: {output_file}")

        return chat_data


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
            results.append({"error": str(e), "url": url})

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
    print(f"\nProcessed {len(urls)} URL(s) successfully!")


if __name__ == "__main__":
    asyncio.run(main())
