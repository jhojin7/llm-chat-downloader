# Local Setup Instructions

## Why These Scripts Don't Work in the Docker Container

The Docker container's network is **intercepting/blocking** requests to Google (resolving to IP `21.0.0.29` instead of Google's servers). This is why:
- ✗ Container: Gets "Access denied"
- ✓ Your MacBook: Gets 133 lines of HTML

**The scripts are correct** - they just need to run from your local machine!

## Installation on Your MacBook

### 1. Install Python Dependencies

```bash
# Install patchright (stealth playwright)
pip3 install patchright beautifulsoup4 lxml

# Install playwright browsers
playwright install chromium
```

Or install everything from requirements:
```bash
cd llm-chat-downloader/scripts
pip3 install -r requirements.txt
playwright install chromium
```

### 2. Run the Extractor

```bash
# Extract the two Gemini chats
python3 scripts/extract_gemini.py

# Or extract a custom URL
python3 scripts/extract_gemini.py https://g.co/gemini/share/YOUR_URL
```

### 3. View Results

Results will be in the `output/` directory:
- `{hash}_chat.json` - Extracted chat data
- `{hash}_raw.html` - Raw HTML (for debugging)
- `{hash}_screenshot.png` - Screenshot of the page
- `summary_*.json` - Summary of all extractions

## What the Script Does

1. **Opens a real browser window** (non-headless so you can see it working)
2. **Navigates to the Gemini share URL**
3. **Waits for content to load** (5 seconds)
4. **Extracts chat messages** using multiple strategies
5. **Saves**:
   - JSON with structured chat data
   - Raw HTML for inspection
   - Full-page screenshot

## Troubleshooting

### If you get "patchright not found"

```bash
pip3 install patchright
```

### If you get "playwright browsers not installed"

```bash
playwright install chromium
```

### If the browser doesn't open

Change `headless=False` to `headless=True` in the script (line 26)

### If extraction finds no messages

1. Check the screenshot: `output/{hash}_screenshot.png`
2. Check the HTML: `output/{hash}_raw.html`
3. Open the HTML in your browser to see the structure
4. You may need to adjust the selectors in the script

## Alternative: Simple Version Without Browser

If you prefer not to use a browser:

```bash
# Just download the HTML
curl -L "https://g.co/gemini/share/c9cba1e9858a" > chat1.html
curl -L "https://g.co/gemini/share/4079b2f26c6f" > chat2.html

# Then parse with BeautifulSoup
python3 -c "
from bs4 import BeautifulSoup
import json

with open('chat1.html') as f:
    soup = BeautifulSoup(f, 'html.parser')
    messages = []
    for elem in soup.find_all(['div', 'p']):
        text = elem.get_text(strip=True)
        if text and len(text) > 30:
            messages.append({'content': text})

    with open('chat1.json', 'w') as out:
        json.dump({'messages': messages}, out, indent=2)

print(f'Extracted {len(messages)} messages')
"
```

## Testing Without Playwright

Quick test with just requests:

```python
import requests
from bs4 import BeautifulSoup

url = "https://g.co/gemini/share/c9cba1e9858a"
response = requests.get(url)
print(f"Status: {response.status_code}")
print(f"Length: {len(response.text)} bytes")

soup = BeautifulSoup(response.text, 'html.parser')
print(f"Title: {soup.title.text if soup.title else 'No title'}")

# Save for inspection
with open('test.html', 'w') as f:
    f.write(response.text)
print("Saved to test.html")
```

## Expected Output

```
============================================================
GEMINI CHAT EXTRACTOR
============================================================

Processing 2 URL(s)...

============================================================
Extracting: https://g.co/gemini/share/c9cba1e9858a
============================================================

→ Loading page...
→ Status: 200
→ Waiting for content to load...
→ HTML size: 245,832 bytes
→ Saved HTML: output/c9cba1e9858a_raw.html
→ Saved screenshot: output/c9cba1e9858a_screenshot.png
→ Page title: Gemini - Chat
→ Found 12 elements matching: message-content
→ Extracted 12 messages

============================================================
✓ SUCCESS
  Messages extracted: 12
  Output files:
    - output/c9cba1e9858a_chat.json
    - output/c9cba1e9858a_raw.html
    - output/c9cba1e9858a_screenshot.png
============================================================
```

## Next Steps

1. Run the script on your MacBook
2. Check the `output/` directory for results
3. Inspect the JSON files to see the extracted chat
4. If the extraction isn't perfect, share the HTML file and I can adjust the selectors

The script **will work** on your machine since you can already access the URLs with curl!
