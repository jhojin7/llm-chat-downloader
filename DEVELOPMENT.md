# Development Guide

## Project Structure

```
llm-chat-downloader/
├── src/                    # React frontend
│   └── App.js             # Main React component
├── server/                # Node.js backend
│   └── index.js           # Express API server
├── scripts/               # Python extraction scripts
│   ├── extract_gemini.py  # Gemini chat extractor
│   └── requirements.txt   # Python dependencies
├── temp/                  # Temporary files (gitignored)
└── build/                 # Production build (gitignored)
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- uv (Python package manager)

### Installation

1. **Install Node.js dependencies:**

   ```bash
   npm install
   ```

2. **Install Python dependencies:**
   ```bash
   cd scripts
   uv venv
   uv pip install -r requirements.txt
   uv run playwright install chromium
   cd ..
   ```

## Running Locally

### Development Mode

Run both frontend and backend concurrently:

```bash
npm run dev
```

This starts:

- React frontend on http://localhost:3000
- Express backend on http://localhost:3001

### Run Backend Only

```bash
npm run server
```

### Run Frontend Only

```bash
npm start
```

## Testing the API

### Using cURL

```bash
# Health check
curl http://localhost:3001/api/health

# Extract chat
curl -X POST http://localhost:3001/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://g.co/gemini/share/4079b2f26c6f"}'
```

### Using the Frontend

1. Start the development servers: `npm run dev`
2. Open http://localhost:3000
3. Paste a Gemini share URL
4. Click "Download chat as JSON"

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Backend server port
PORT=3001

# React app API URL (for production)
REACT_APP_API_URL=
```

## Production Build

### Build Frontend

```bash
npm run build
```

### Run in Production Mode

```bash
NODE_ENV=production node server/index.js
```

The server will:

- Serve the React app on http://localhost:3001
- Provide the API at http://localhost:3001/api/extract

## Docker

### Build Image

```bash
docker build -t llm-chat-downloader .
```

### Run Container

```bash
docker run -p 8080:8080 llm-chat-downloader
```

Access at http://localhost:8080

## API Documentation

See [API.md](./API.md) for detailed API documentation.

## Architecture

### Frontend (React)

- Simple UI for entering Gemini share URLs
- Calls backend API to extract chat
- Downloads result as JSON file

### Backend (Express)

- POST /api/extract - Accepts URL, calls Python script, returns JSON
- GET /api/health - Health check endpoint
- Serves static frontend files in production

### Python Extraction (extract_gemini.py)

- Uses Patchright (patched Playwright) to load Gemini pages
- Scrolls to load all conversation turns
- Extracts structured data with markdown formatting
- Preserves hyperlinks in [text](url) format

## Troubleshooting

### Backend can't find Python script

Make sure you're using `uv run python` instead of bare `python`:

```bash
cd scripts
uv run python extract_gemini.py <URL>
```

### Playwright browser not found

Install Playwright browsers:

```bash
cd scripts
uv run playwright install chromium
```

### Port already in use

Change the port in `.env`:

```env
PORT=3002
```

## Development Workflow

1. Make changes to code
2. Frontend auto-reloads (React hot reload)
3. Backend requires manual restart
4. Test using the frontend or cURL
5. Commit changes
