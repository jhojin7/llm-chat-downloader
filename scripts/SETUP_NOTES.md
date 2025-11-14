# Gemini Chat Extractor - Setup & Troubleshooting Notes

**Date:** 2025-11-14  
**Status:** ✅ Working

## Summary

Successfully set up and ran the Gemini chat extractor script to download shared Gemini conversations. The script uses Playwright (via patchright) to render JavaScript-heavy pages and extract chat content.

## Prerequisites

- **uv** (Python environment manager) - Required per project `CLAUDE.md` rules
- **Python 3.11+** (uv will handle this)
- **Chromium browser** (installed via Playwright)

## Initial Setup

### 1. Create Virtual Environment with uv

```bash
cd llm-chat-downloader
uv venv
```

This creates a `.venv` directory with Python 3.11.13.

### 2. Install Python Dependencies

```bash
uv pip install -r scripts/requirements.txt
```

**Key packages installed:**

- `patchright==1.56.0` - Stealth version of Playwright for bot detection avoidance
- `playwright==1.56.0` - Browser automation
- `beautifulsoup4==4.14.2` - HTML parsing
- `crawl4ai==0.7.7` - Advanced web crawling (dependency)
- `lxml==5.4.0` - XML/HTML parser

### 3. Install Chromium Browser

```bash
uv run playwright install chromium
```

This downloads ~130MB of Chromium to `~/Library/Caches/ms-playwright/`.

## Running the Script

**Always use `uv run python` (not bare `python3`):**

```bash
uv run python scripts/extract_gemini.py
```

**Custom URLs:**

```bash
uv run python scripts/extract_gemini.py https://g.co/gemini/share/YOUR_URL
```

## Issues Encountered & Fixes

### Issue 1: Python Version Mismatch

**Problem:**

- System `python3` is 3.9.6 (too old for requirements)
- Homebrew `pip3` was using Python 3.13
- Packages installed in wrong Python environment

**Solution:**

- Use `uv` to manage the environment (creates its own Python 3.11.13)
- Always run scripts with `uv run python`

### Issue 2: Browser Close / Target Closed Error

**Error:**

```
patchright._impl._errors.TargetClosedError: Page.goto: Target page, context or browser has been closed
```

**Cause:** Script had `headless=False`, which opened a visible browser window. If manually closed, the script would fail.

**Fix:** Changed to `headless=True` in line 33 of `extract_gemini.py`:

```python
browser = await p.chromium.launch(
    headless=True,  # Changed from False
    args=["--no-sandbox", "--disable-setuid-sandbox"],
)
```

### Issue 3: Page Load Timeout

**Error:**

```
patchright._impl._errors.TimeoutError: Page.goto: Timeout 60000ms exceeded.
Call log:
  - navigating to "...", waiting until "networkidle"
```

**Cause:** Gemini share pages use heavy JavaScript/dynamic content. The `networkidle` event never fires because the page continuously makes network requests.

**Fix:** Changed wait strategy in line 44-48 of `extract_gemini.py`:

```python
# OLD:
response = await page.goto(url, wait_until='networkidle', timeout=60000)

# NEW:
response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)
```

**Explanation:**

- `domcontentloaded` = Wait only for HTML parsing, not all resources
- Reduced timeout from 60s to 30s (faster failure for debugging)
- Added 5-second sleep after page load to let JS finish rendering

## Output Files

All files are saved to `output/` directory:

```
output/
├── c9cba1e9858a_chat.json       # Structured chat data (5.4KB)
├── c9cba1e9858a_raw.html        # Full page HTML (760KB)
├── c9cba1e9858a_screenshot.png  # Full-page screenshot (174KB)
├── 4079b2f26c6f_chat.json       # Second chat (5.1KB)
├── 4079b2f26c6f_raw.html        # Second HTML (761KB)
├── 4079b2f26c6f_screenshot.png  # Second screenshot (178KB)
└── summary_YYYYMMDD_HHMMSS.json # Summary of all extractions
```

### JSON Structure

```json
{
  "url": "https://g.co/gemini/share/...",
  "timestamp": "2025-11-14T20:31:26.798481",
  "page_title": "‎Gemini - direct access to Google AI",
  "status_code": 200,
  "message_count": 1,
  "messages": [
    {
      "index": 0,
      "content": "...",
      "selector": "message-content",
      "role": "unknown"
    }
  ]
}
```

## Current Limitations

1. **Only extracts visible content** - Gemini share pages only show the final AI response, not the full conversation history
2. **Single message per URL** - The script finds 1 message per share link (the AI's response)
3. **No conversation context** - User prompts are not visible in the shared page HTML

## Successful Extractions

### Test URLs Processed:

1. **https://g.co/gemini/share/c9cba1e9858a**
   - Topic: How to export Instagram group chat data
   - HTML Size: 777KB
   - Messages: 1

2. **https://g.co/gemini/share/4079b2f26c6f**
   - Topic: Instagram Reels analysis with embedding/clustering
   - HTML Size: 779KB
   - Messages: 1

## Dependencies Note

Some package version conflicts exist but don't affect the extractor:

- `langchain-openai` wants `openai<2.0.0`, we have `2.8.0`
- `unstructured-client` wants `pydantic<2.10.0`, we have `2.12.4`

These warnings can be ignored as they're for unrelated features.

## Future Improvements

- [ ] Try different CSS selectors to extract more message elements
- [ ] Add OCR on screenshots as fallback for text extraction
- [ ] Parse the HTML more aggressively to find hidden conversation data
- [ ] Support other LLM chat platforms (ChatGPT, Claude, etc.)

## References

- [Patchright Documentation](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)
- [Playwright Python Docs](https://playwright.dev/python/)
- Project rule: `CLAUDE.md` - Always use `uv run python` for scripts
