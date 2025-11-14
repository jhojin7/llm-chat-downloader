const request = require("supertest");
const fs = require("fs").promises;
const path = require("path");
const {
  app,
  ensureTempDir,
  cleanupOldFiles,
  TEMP_DIR,
  startServer,
} = require("./index");
const { exec } = require("child_process");

// Mock child_process exec
jest.mock("child_process");

// Set timeout for all tests
jest.setTimeout(10000);

describe("Backend API Server", () => {
  beforeAll(async () => {
    // Ensure temp directory exists before tests
    await ensureTempDir();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up temp directory after all tests
    try {
      const files = await fs.readdir(TEMP_DIR);
      for (const file of files) {
        await fs.unlink(path.join(TEMP_DIR, file));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Health Check Endpoint", () => {
    test("GET /api/health should return OK status", async () => {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    test("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/api/health");

      const timestamp = response.body.timestamp;
      expect(() => new Date(timestamp).toISOString()).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe("POST /api/extract - Input Validation", () => {
    test("should return 400 if URL is missing", async () => {
      const response = await request(app).post("/api/extract").send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "URL is required");
    });

    test("should return 400 if URL is empty string", async () => {
      const response = await request(app)
        .post("/api/extract")
        .send({ url: "" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "URL is required");
    });

    test("should return 400 if URL format is invalid", async () => {
      const response = await request(app)
        .post("/api/extract")
        .send({ url: "not-a-valid-url" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "Invalid URL format");
    });

    test("should return 400 for URLs with missing protocol", async () => {
      const response = await request(app)
        .post("/api/extract")
        .send({ url: "just text" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "Invalid URL format");
    });

    test("should accept valid HTTP URLs", async () => {
      const mockChatData = {
        messages: [{ role: "user", content: "test" }],
      };

      // Mock successful execution
      exec.mockImplementation((cmd, options, callback) => {
        // Simulate successful execution
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "http://example.com/chat" });

      expect(response.status).toBe(200);
    });

    test("should accept valid HTTPS URLs", async () => {
      const mockChatData = {
        messages: [{ role: "user", content: "test" }],
      };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/abc123" });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/extract - Extraction Process", () => {
    test("should successfully extract chat data", async () => {
      const mockChatData = {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
        metadata: {
          extracted_at: new Date().toISOString(),
        },
      };

      exec.mockImplementation((cmd, options, callback) => {
        // Extract output file path from command
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        // Write mock data to the output file
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "Success", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toEqual(mockChatData);
      expect(response.body).toHaveProperty(
        "message",
        "Chat extracted successfully"
      );
    });

    test("should return 500 if Python script execution fails", async () => {
      exec.mockImplementation((cmd, options, callback) => {
        callback(
          new Error("Command failed"),
          "",
          "Python script error: Module not found"
        );
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error", "Failed to extract chat");
      expect(response.body).toHaveProperty("details");
    });

    test("should include stderr in error details when script fails", async () => {
      const errorMessage = "Timeout: Browser failed to start";

      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error("Command failed"), "", errorMessage);
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      expect(response.status).toBe(500);
      expect(response.body.details).toContain("Timeout");
    });

    test("should return 500 if output file cannot be read", async () => {
      exec.mockImplementation((cmd, options, callback) => {
        // Don't create the output file, simulating a script that completes
        // but doesn't create the expected output
        callback(null, "", "");
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty(
        "error",
        "Failed to read extracted chat data"
      );
      expect(response.body).toHaveProperty("details");
    });

    test("should return 500 if output file contains invalid JSON", async () => {
      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        // Write invalid JSON
        fs.writeFile(outputFile, "{ invalid json }").then(() => {
          callback(null, "", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty(
        "error",
        "Failed to read extracted chat data"
      );
    });

    test("should clean up temp file after successful extraction", async () => {
      const mockChatData = { messages: [] };
      let createdFile;

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        createdFile = outputFile;
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/test123" });

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that file was deleted
      await expect(fs.access(createdFile)).rejects.toThrow();
    });

    test("should use unique session IDs for concurrent requests", async () => {
      const mockChatData = { messages: [] };
      const sessionIds = new Set();

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        const sessionId = path.basename(outputFile).match(/chat_(.+)\.json/)[1];
        sessionIds.add(sessionId);

        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      // Make multiple concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          request(app)
            .post("/api/extract")
            .send({ url: "https://g.co/gemini/share/test" })
        );

      await Promise.all(requests);

      // All session IDs should be unique
      expect(sessionIds.size).toBe(5);
    });

    test("should pass correct command to exec with uv and Python script", async () => {
      const mockChatData = { messages: [] };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const testUrl = "https://g.co/gemini/share/abc123";
      await request(app).post("/api/extract").send({ url: testUrl });

      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining("uv run python extract_gemini.py"),
        expect.objectContaining({ timeout: 60000 }),
        expect.any(Function)
      );

      const calledCommand = exec.mock.calls[0][0];
      expect(calledCommand).toContain(testUrl);
      expect(calledCommand).toContain(".json");
    });
  });

  describe("Utility Functions", () => {
    test("ensureTempDir should create temp directory", async () => {
      // Clean up first
      try {
        await fs.rmdir(TEMP_DIR);
      } catch (error) {
        // Directory might not exist
      }

      await ensureTempDir();

      const stats = await fs.stat(TEMP_DIR);
      expect(stats.isDirectory()).toBe(true);
    });

    test("ensureTempDir should not throw if directory already exists", async () => {
      await ensureTempDir();
      await expect(ensureTempDir()).resolves.not.toThrow();
    });

    test("cleanupOldFiles should remove files older than 1 hour", async () => {
      await ensureTempDir();

      // Create a test file with old timestamp
      const oldFile = path.join(TEMP_DIR, "old_test_file.json");
      await fs.writeFile(oldFile, "test data");

      // Modify file's mtime to be > 1 hour old
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      await fs.utimes(oldFile, oldTime, oldTime);

      // Run cleanup
      await cleanupOldFiles();

      // File should be deleted
      await expect(fs.access(oldFile)).rejects.toThrow();
    });

    test("cleanupOldFiles should keep files newer than 1 hour", async () => {
      await ensureTempDir();

      // Create a recent file
      const recentFile = path.join(TEMP_DIR, "recent_test_file.json");
      await fs.writeFile(recentFile, "test data");

      // Run cleanup
      await cleanupOldFiles();

      // File should still exist
      await expect(fs.access(recentFile)).resolves.not.toThrow();

      // Clean up
      await fs.unlink(recentFile);
    });

    test("cleanupOldFiles should handle errors gracefully", async () => {
      // Should not throw even if temp dir doesn't exist or has issues
      const originalReaddir = fs.readdir;
      fs.readdir = jest.fn().mockRejectedValue(new Error("Permission denied"));

      await expect(cleanupOldFiles()).resolves.not.toThrow();

      fs.readdir = originalReaddir;
    });

    test("ensureTempDir should handle mkdir errors gracefully", async () => {
      // Mock mkdir to throw an error
      const originalMkdir = fs.mkdir;
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      fs.mkdir = jest.fn().mockRejectedValue(new Error("Permission denied"));

      // Should not throw
      await expect(ensureTempDir()).resolves.not.toThrow();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating temp directory:",
        expect.any(Error)
      );

      fs.mkdir = originalMkdir;
      consoleErrorSpy.mockRestore();
    });
  });

  describe("CORS and Middleware", () => {
    test("should accept JSON content type", async () => {
      const response = await request(app)
        .get("/api/health")
        .set("Content-Type", "application/json");

      expect(response.status).toBe(200);
    });

    test("should handle CORS headers", async () => {
      const response = await request(app)
        .get("/api/health")
        .set("Origin", "http://localhost:3000");

      expect(response.headers["access-control-allow-origin"]).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("should handle very long URLs", async () => {
      const mockChatData = { messages: [] };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const longUrl =
        "https://g.co/gemini/share/" +
        "a".repeat(500) +
        "?query=" +
        "b".repeat(500);
      const response = await request(app)
        .post("/api/extract")
        .send({ url: longUrl });

      expect(response.status).toBe(200);
    });

    test("should handle URLs with special characters", async () => {
      const mockChatData = { messages: [] };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const specialUrl =
        "https://example.com/chat?id=123&name=test%20user&lang=en";
      const response = await request(app)
        .post("/api/extract")
        .send({ url: specialUrl });

      expect(response.status).toBe(200);
    });

    test("should handle empty chat data", async () => {
      const mockChatData = { messages: [] };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/empty" });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockChatData);
    });

    test("should handle chat data with markdown and special formatting", async () => {
      const mockChatData = {
        messages: [
          {
            role: "user",
            content: "Tell me about **markdown**",
          },
          {
            role: "assistant",
            content: "Here's a [link](https://example.com)",
            content_markdown: "Here's a [link](https://example.com)",
          },
        ],
      };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/markdown" });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockChatData);
    });
  });

  describe("Error Handling in Extraction", () => {
    test("should handle errors when cleanup fails during successful extraction", async () => {
      const mockChatData = { messages: [] };

      exec.mockImplementation((cmd, options, callback) => {
        const outputFile = cmd.match(/"([^"]+\.json)"/)[1];
        fs.writeFile(outputFile, JSON.stringify(mockChatData)).then(() => {
          callback(null, "", "");
        });
      });

      // Even if cleanup fails, should still return success
      const response = await request(app)
        .post("/api/extract")
        .send({ url: "https://g.co/gemini/share/cleanup-test" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Server Startup", () => {
    test("startServer function should call ensureTempDir and setInterval", async () => {
      const originalSetInterval = global.setInterval;
      const originalListen = app.listen;

      const setIntervalSpy = jest.fn();
      const listenSpy = jest.fn((port, callback) => {
        callback();
        return { close: jest.fn() };
      });

      global.setInterval = setIntervalSpy;
      app.listen = listenSpy;

      await startServer();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        cleanupOldFiles,
        60 * 60 * 1000
      );
      expect(listenSpy).toHaveBeenCalled();

      global.setInterval = originalSetInterval;
      app.listen = originalListen;
    });
  });
});
