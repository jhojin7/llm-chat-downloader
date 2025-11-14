# Gemini Chat History Extractor

This directory contains scripts for extracting chat history from Gemini shared URLs using crawl4ai.

## Installation

The required dependencies have been installed:
- crawl4ai (v0.7.7)
- playwright with chromium browser
- beautifulsoup4 for HTML parsing

## Usage

### Basic Usage

```bash
python3 scripts/gemini_chat_extractor.py
```

This will extract chat history from the default URLs configured in the script.

### Custom URLs

```bash
python3 scripts/gemini_chat_extractor.py https://g.co/gemini/share/YOUR_SHARE_ID
```

### Output

The script creates an `output/` directory with:
- Individual JSON files for each extracted chat
- Debug HTML files for troubleshooting
- A summary JSON file with extraction results

## Important Limitations

### Access Restrictions

The provided URLs (`https://g.co/gemini/share/c9cba1e9858a` and `https://g.co/gemini/share/4079b2f26c6f`) are returning **403 Forbidden** errors with "Access denied" messages.

This typically means:

1. **Private/Authenticated Content**: The shared chats may require Google account authentication
2. **Expired Links**: The share links may have expired or been revoked
3. **IP/Bot Restrictions**: Google may be blocking automated access to these URLs

### Test Results

Both URLs returned:
- Status Code: 403
- HTML Content: `<pre>Access denied</pre>`
- HTML Length: 164 bytes

### Working Around Restrictions

For publicly accessible Gemini shared chats, this script should work. For restricted content, consider:

1. **Manual Export**: Use Gemini's built-in export functionality
2. **Browser Extension**: Use a browser extension that can export chat history while logged in
3. **API Access**: Use official Google Gemini APIs if available
4. **Cookie Authentication**: Modify the script to use authenticated browser sessions (requires user cookies)

## Script Features

### Current Capabilities

- Asynchronous web crawling with crawl4ai
- Stealth mode to avoid bot detection
- Multiple CSS selector strategies for different chat layouts
- Markdown extraction as fallback
- JSON output with structured message data
- Debug HTML saving for troubleshooting

### Extraction Strategy

The script tries multiple approaches:
1. CSS selectors for conversation turns
2. Class-based message detection
3. Markdown text extraction and parsing
4. General text block extraction

### Output Format

```json
{
  "url": "https://g.co/gemini/share/...",
  "timestamp": "2025-11-14T10:03:11.595211",
  "message_count": 5,
  "messages": [
    {
      "index": 0,
      "role": "user",
      "content": "User message text",
      "element_class": "user-message"
    },
    {
      "index": 1,
      "role": "assistant",
      "content": "Assistant response text",
      "element_class": "model-response"
    }
  ],
  "raw_markdown": "First 5000 chars of markdown..."
}
```

## Testing with Accessible URLs

To test with your own Gemini chats:

1. Open a Gemini chat
2. Click the share button
3. Copy the public share URL
4. Ensure the share settings allow public access
5. Run the script with your URL

Example:
```bash
python3 scripts/gemini_chat_extractor.py https://g.co/gemini/share/YOUR_PUBLIC_SHARE
```

## Troubleshooting

### 403 Forbidden Errors

If you get "Access denied":
- Verify the URL is publicly accessible in an incognito browser window
- Check if the share link has expired
- Try accessing the URL directly in a browser first

### Empty Message Extraction

If messages are not being extracted:
- Check the debug HTML file in the `output/` directory
- The page structure may have changed
- Consider updating the CSS selectors in the script

### Timeout Issues

If the script times out:
- Increase the `page_timeout` value
- Check your internet connection
- The page may require longer load times

## Future Improvements

Potential enhancements:
- Cookie-based authentication support
- Better handling of dynamic content
- More sophisticated message parsing
- Support for multiple LLM chat platforms
- Parallel URL processing
- Retry logic for failed requests

## Technical Details

### Dependencies

- **crawl4ai**: Modern async web crawling framework
- **playwright**: Headless browser automation
- **beautifulsoup4**: HTML parsing
- **aiohttp**: Async HTTP client

### Architecture

The script uses:
- Async/await for efficient I/O
- Playwright for JavaScript rendering
- Multiple extraction strategies for robustness
- BeautifulSoup for HTML parsing
- JSON for structured output

## Contributing

To improve the extraction:
1. Update CSS selectors in `extract_gemini_chat()`
2. Add new extraction strategies
3. Improve message role detection
4. Add support for other platforms

## License

Part of the llm-chat-downloader project.
