import { useState } from "react";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import DownloadIcon from "@mui/icons-material/Download";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CircularProgress from "@mui/material/CircularProgress";

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

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !loading) {
      handleDownload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-3xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-lg shadow-orange-500/30">
            <CloudDownloadIcon sx={{ fontSize: 36, color: "white" }} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
            LLM Chat Downloader
          </h1>
          <p className="text-lg text-gray-600">
            Extract and download conversations from public share links
          </p>
        </div>

        {/* Main Card */}
        <div
          className="glass-card p-8 md:p-10 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="space-y-6">
            {/* Input */}
            <div>
              <label
                htmlFor="url-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Share Link URL
              </label>
              <input
                id="url-input"
                type="text"
                placeholder="Paste your public chat URL here..."
                value={url}
                className="input-field"
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                autoComplete="off"
              />
            </div>

            {/* Button */}
            <button
              onClick={handleDownload}
              disabled={loading}
              className="btn-primary w-full"
            >
              <span className="flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <CircularProgress size={20} sx={{ color: "white" }} />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon sx={{ fontSize: 20 }} />
                    <span>Download as JSON</span>
                  </>
                )}
              </span>
            </button>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                <div className="flex items-start gap-3">
                  <ErrorOutlineIcon
                    sx={{ fontSize: 20, color: "#ef4444" }}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div
          className="mt-8 text-center animate-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="inline-block glass-card px-8 py-6">
            <p className="text-sm text-gray-600 mb-4">
              <strong className="text-gray-800">Supported platforms:</strong>
            </p>
            <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span>Claude (claude.ai/share/...)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Gemini (g.co/gemini/share/...)</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Supports markdown formatting and hyperlinks
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Made with care for the AI community</p>
        </div>
      </div>
    </div>
  );
}

export default App;
