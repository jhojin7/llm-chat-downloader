import React, { useState } from "react";

function extractChatFromHtml(html) {
  // Naive extraction from text. This depends on the LLM service.
  // You may want to adjust selectors for each chat (e.g., GPT, Gemini, Claude)
  // Example: look for key chat containers and extract text.
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let chat = [];
  // For demonstration: Find all elements with a role or class indicating a chat turn.
  // Replace below with selectors for the service you want.
  const chatPrompts = doc.querySelectorAll(
    '[class*="message"], [class*="prompt"], [role="presentation"], .markdown, .user-message, .model-message'
  );
  chatPrompts.forEach((el, idx) => {
    chat.push({ index: idx, text: el.textContent.trim() });
  });
  return chat;
}

function downloadJson(obj, filename) {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(obj, null, 2));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function App() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setError("");
    if (!url) {
      setError("Please enter a chat page URL.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not fetch the page.");
      const html = await res.text();
      const chat = extractChatFromHtml(html);
      if (!chat.length) throw new Error("No chat found. Try another URL.");
      downloadJson(chat, "chat.json");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 500, margin: "auto", padding: 20 }}>
      <h3>LLM Chat Downloader (Minimal)</h3>
      <input
        type="text"
        placeholder="Paste public ChatGPT/Gemini/Claude chat URL here"
        value={url}
        style={{ width: "100%", marginBottom: 8, padding: 4 }}
        onChange={(e) => setUrl(e.target.value)}
        disabled={loading}
      />
      <button onClick={handleDownload} disabled={loading}>
        {loading ? "Downloading..." : "Download chat as JSON"}
      </button>
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 20, fontSize: 12, color: "#777" }}>
        This tool works for public chats only.
        <br />
        For best results, paste a link to an openly viewable ChatGPT, Gemini, or
        Claude conversation.
        <br />
        Parsing is naive; success depends on page structure.
      </div>
    </div>
  );
}

export default App;
