import { useState } from "react";

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
      // Call the backend API
      const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to extract chat");
      }

      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error("No chat data received from server");
      }

      // Download the chat data
      downloadJson(data.data, "chat.json");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: "auto", padding: 20 }}>
      <h3>LLM Chat Downloader</h3>
      <input
        type="text"
        placeholder="Paste public chat URL (Claude or Gemini share link)"
        value={url}
        style={{ width: "100%", marginBottom: 8, padding: 8 }}
        onChange={(e) => setUrl(e.target.value)}
        disabled={loading}
      />
      <button
        onClick={handleDownload}
        disabled={loading}
        style={{ padding: "8px 16px", cursor: loading ? "wait" : "pointer" }}
      >
        {loading ? "Extracting..." : "Download chat as JSON"}
      </button>
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 20, fontSize: 12, color: "#777" }}>
        This tool extracts conversation history from public share links.
        <br />
        <strong>Supported platforms:</strong>
        <br />
        • Claude: https://claude.ai/share/...
        <br />
        • Gemini: https://g.co/gemini/share/...
        <br />
        <br />
        Supports markdown formatting and hyperlinks.
      </div>
    </div>
  );
}

export default App;
