# HTML to Markdown Conversion Libraries

This document compares two popular Python libraries for converting HTML to Markdown, used in the Gemini chat extractor.

## Current Choice: markdownify

**Installation:**

```bash
uv pip install markdownify
```

**Usage:**

```python
from markdownify import markdownify as md

html_content = '<div><a href="https://example.com">Link Text</a></div>'
markdown = md(html_content, heading_style="ATX")
# Output: [Link Text](https://example.com)
```

**Pros:**

- Clean, simple API
- Good control over markdown style (ATX vs. Setext headings)
- Lightweight and focused on conversion
- Preserves link formatting well
- Good for structured HTML (like Gemini's response format)

**Cons:**

- Less configuration options compared to html2text
- May not handle all edge cases in complex HTML

---

## Alternative: html2text

**Installation:**

```bash
uv pip install html2text
```

**Usage:**

```python
import html2text

h = html2text.HTML2Text()
h.ignore_links = False
h.body_width = 0  # Don't wrap text

html_content = '<div><a href="https://example.com">Link Text</a></div>'
markdown = h.handle(html_content)
# Output: [Link Text](https://example.com)
```

**Pros:**

- More configuration options (ignore images, links, emphasis, etc.)
- Better handling of complex HTML
- Can control text wrapping and formatting
- More mature library (been around longer)

**Cons:**

- More verbose API
- Requires more configuration to get desired output
- Can be overly aggressive with formatting in some cases

---

## Comparison Table

| Feature                | markdownify | html2text |
| ---------------------- | ----------- | --------- |
| **API Simplicity**     | ★★★★★       | ★★★☆☆     |
| **Configuration**      | ★★★☆☆       | ★★★★★     |
| **Link Preservation**  | ★★★★★       | ★★★★★     |
| **Performance**        | ★★★★☆       | ★★★★☆     |
| **Edge Cases**         | ★★★☆☆       | ★★★★☆     |
| **Active Maintenance** | ★★★★☆       | ★★★★☆     |

---

## Recommendation

For the Gemini chat extractor, **markdownify** is the better choice because:

1. Gemini's HTML is well-structured and doesn't have complex edge cases
2. Simple API means less code and easier maintenance
3. ATX-style heading control matches common markdown conventions
4. Links are preserved cleanly without extra configuration

**When to use html2text:**

- If you need to ignore certain HTML elements (images, tables)
- If you need fine-grained control over text wrapping
- If you're dealing with extremely complex or malformed HTML

---

## Implementation in extract_gemini.py

Currently using markdownify:

```python
from markdownify import markdownify as md

# Convert HTML to markdown
response_markdown = md(str(markdown_div), heading_style="ATX")
```

To switch to html2text (if needed):

```python
import html2text

h = html2text.HTML2Text()
h.ignore_links = False
h.body_width = 0

# Convert HTML to markdown
response_markdown = h.handle(str(markdown_div))
```

---

## Output Format

Both libraries produce markdown-formatted content stored in the JSON:

```json
{
  "role": "assistant",
  "content": "plain text (backward compatible)",
  "content_markdown": "text with [links](https://...) preserved",
  "links": [{ "text": "links", "url": "https://..." }]
}
```

- `content`: Plain text (uses BeautifulSoup's `.get_text()`)
- `content_markdown`: Full markdown with links and formatting
- `links`: Separate array for easy programmatic access to all links
