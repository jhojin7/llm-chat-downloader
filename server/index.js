const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Temporary directory for output files
const TEMP_DIR = path.join(__dirname, "..", "temp");

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating temp directory:", error);
  }
}

// Clean up old temp files (older than 1 hour)
async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtime.getTime() > oneHour) {
        await fs.unlink(filePath);
      }
    }
  } catch (error) {
    console.error("Error cleaning up temp files:", error);
  }
}

// API endpoint to extract chat from URL
app.post("/api/extract", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  // Generate unique filename
  const sessionId = crypto.randomBytes(8).toString("hex");
  const outputFile = path.join(TEMP_DIR, `chat_${sessionId}.json`);

  // Path to Python script
  const scriptPath = path.join(__dirname, "..", "scripts", "extract_gemini.py");

  // Execute Python script with uv
  const command = `cd "${path.dirname(scriptPath)}" && uv run python extract_gemini.py "${url}" "${outputFile}"`;

  console.log(`Extracting chat from: ${url}`);
  console.log(`Output file: ${outputFile}`);

  exec(command, { timeout: 60000 }, async (error, _stdout, stderr) => {
    if (error) {
      console.error("Extraction error:", error);
      console.error("stderr:", stderr);
      return res.status(500).json({
        error: "Failed to extract chat",
        details: stderr || error.message,
      });
    }

    try {
      // Read the generated JSON file
      const chatData = await fs.readFile(outputFile, "utf8");
      const chat = JSON.parse(chatData);

      // Clean up the temp file
      await fs.unlink(outputFile).catch(() => {});

      // Return the chat data
      res.json({
        success: true,
        data: chat,
        message: "Chat extracted successfully",
      });
    } catch (readError) {
      console.error("Error reading output file:", readError);
      res.status(500).json({
        error: "Failed to read extracted chat data",
        details: readError.message,
      });
    }
  });
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "build", "index.html"));
  });
}

// Start server
async function startServer() {
  await ensureTempDir();
  // Clean up old files every hour
  setInterval(cleanupOldFiles, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/extract`);
  });
}

startServer();
