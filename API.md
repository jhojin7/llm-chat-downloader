# API Documentation

## Gemini Chat Extraction API

### Base URL

- Development: `http://localhost:3001`
- Production: (Your deployed URL)

### Endpoints

#### 1. Extract Chat - `POST /api/extract`

Extracts conversation history from a Gemini share link and returns the structured data.

**Request:**

```json
{
  "url": "https://g.co/gemini/share/4079b2f26c6f"
}
```

**Response (Success - 200):**

```json
{
  "success": true,
  "message": "Chat extracted successfully",
  "data": {
    "url": "https://g.co/gemini/share/4079b2f26c6f",
    "timestamp": "2025-11-14T20:30:00.000Z",
    "page_title": "Gemini - Google",
    "status_code": 200,
    "message_count": 4,
    "messages": [
      {
        "index": 0,
        "turn": 0,
        "role": "user",
        "content": "What is machine learning?"
      },
      {
        "index": 1,
        "turn": 0,
        "role": "assistant",
        "content": "Machine learning is...",
        "content_markdown": "**Machine learning** is a type of [artificial intelligence](https://example.com)...",
        "links": [
          {
            "text": "artificial intelligence",
            "url": "https://example.com"
          }
        ]
      }
    ]
  }
}
```

**Response (Error - 400/500):**

```json
{
  "error": "Failed to extract chat",
  "details": "Error message details"
}
```

#### 2. Health Check - `GET /api/health`

Check if the API is running.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2025-11-14T20:30:00.000Z"
}
```

### Data Format

Each message in the `messages` array contains:

- `index` (number): Sequential message index
- `turn` (number): Conversation turn number
- `role` (string): Either "user" or "assistant"
- `content` (string): Plain text content
- `content_markdown` (string, assistant only): Markdown formatted content with preserved hyperlinks
- `links` (array, optional): Array of hyperlinks found in the message
  - `text` (string): Link text
  - `url` (string): Link URL

### Example Usage

#### JavaScript/Fetch

```javascript
const response = await fetch("http://localhost:3001/api/extract", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://g.co/gemini/share/4079b2f26c6f",
  }),
});

const data = await response.json();
console.log(data.data.messages);
```

#### cURL

```bash
curl -X POST http://localhost:3001/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://g.co/gemini/share/4079b2f26c6f"}'
```

### Notes

- Only public Gemini share links are supported (g.co/gemini/share/...)
- Extraction takes 10-30 seconds depending on conversation length
- The API automatically scrolls to load all conversation turns
- Temporary files are cleaned up after 1 hour
- Hyperlinks are preserved in markdown format: `[text](url)`
