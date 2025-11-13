import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App Component", () => {
  describe("Rendering", () => {
    test("renders LLM Chat Downloader heading", () => {
      render(<App />);
      const headingElement = screen.getByText(/LLM Chat Downloader/i);
      expect(headingElement).toBeInTheDocument();
    });

    test("renders input field for URL", () => {
      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      expect(inputElement).toBeInTheDocument();
    });

    test("renders download button", () => {
      render(<App />);
      const buttonElement = screen.getByRole("button", {
        name: /Download chat as JSON/i,
      });
      expect(buttonElement).toBeInTheDocument();
    });

    test("renders helper text about public chats", () => {
      render(<App />);
      const helperText = screen.getByText(
        /This tool works for public chats only./i
      );
      expect(helperText).toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    test("allows user to type in the URL input field", async () => {
      const user = userEvent.setup();
      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      await user.type(inputElement, "https://example.com/chat");
      expect(inputElement).toHaveValue("https://example.com/chat");
    });

    test("input field is disabled during loading", async () => {
      global.fetch = jest.fn(
        () => new Promise(() => {}) // Never resolves to keep loading state
      );

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(inputElement).toBeDisabled();
      });

      global.fetch.mockRestore();
    });
  });

  describe("Download Functionality", () => {
    let originalCreateElement;
    let originalAppendChild;

    beforeEach(() => {
      // Reset fetch mock before each test
      global.fetch = jest.fn();

      // Save originals
      originalCreateElement = document.createElement;
      originalAppendChild = document.body.appendChild;
    });

    afterEach(() => {
      // Restore originals
      document.createElement = originalCreateElement;
      document.body.appendChild = originalAppendChild;
      jest.restoreAllMocks();
    });

    const setupDownloadMocks = () => {
      const mockLink = {
        setAttribute: jest.fn(),
        click: jest.fn(),
        remove: jest.fn(),
      };

      document.createElement = jest.fn((tag) => {
        if (tag === "a") {
          return mockLink;
        }
        return originalCreateElement.call(document, tag);
      });

      document.body.appendChild = jest.fn();

      return mockLink;
    };

    test("shows error when URL is empty", async () => {
      render(<App />);
      const buttonElement = screen.getByRole("button");

      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(/Please enter a chat page URL./i);
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("shows error when fetch fails", async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(/Network error/i);
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("shows error when response is not ok", async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(/Could not fetch the page./i);
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("shows error when no chat found in HTML", async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<html><body>No chat here</body></html>"),
        })
      );

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(
          /No chat found. Try another URL./i
        );
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("successfully downloads chat when HTML contains messages", async () => {
      const mockHtml = `
        <html>
          <body>
            <div class="message">Hello, how are you?</div>
            <div class="message">I'm doing great, thanks!</div>
          </body>
        </html>
      `;

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockHtml),
        })
      );

      render(<App />);
      const mockLink = setupDownloadMocks();

      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(mockLink.click).toHaveBeenCalled();
      });

      // Verify error message is cleared
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    test("button shows 'Downloading...' during loading", async () => {
      let resolvePromise;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      global.fetch = jest.fn(() => fetchPromise);

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(buttonElement).toHaveTextContent(/Downloading.../i);
        expect(buttonElement).toBeDisabled();
      });

      // Resolve the promise to clean up
      resolvePromise({
        ok: true,
        text: () => Promise.resolve('<div class="message">test</div>'),
      });
    });

    test("clears previous error on new download attempt", async () => {
      render(<App />);
      const buttonElement = screen.getByRole("button");

      // First attempt without URL
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(
          screen.getByText(/Please enter a chat page URL./i)
        ).toBeInTheDocument();
      });

      // Second attempt with URL
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<div class="message">test</div>'),
        })
      );

      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(
          screen.queryByText(/Please enter a chat page URL./i)
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("HTML Parsing", () => {
    let originalCreateElement;
    let originalAppendChild;

    beforeEach(() => {
      // Save originals
      originalCreateElement = document.createElement;
      originalAppendChild = document.body.appendChild;
      global.fetch = jest.fn();
    });

    afterEach(() => {
      // Restore originals
      document.createElement = originalCreateElement;
      document.body.appendChild = originalAppendChild;
      jest.restoreAllMocks();
    });

    const setupDownloadMocks = () => {
      const mockLink = {
        setAttribute: jest.fn(),
        click: jest.fn(),
        remove: jest.fn(),
      };

      document.createElement = jest.fn((tag) => {
        if (tag === "a") {
          return mockLink;
        }
        return originalCreateElement.call(document, tag);
      });

      document.body.appendChild = jest.fn();

      return mockLink;
    };

    test("extracts messages with different class patterns", async () => {
      const mockHtml = `
        <html>
          <body>
            <div class="user-message">User message</div>
            <div class="model-message">Model response</div>
            <div class="prompt">Another prompt</div>
            <div role="presentation">Presentation content</div>
            <div class="markdown">Markdown content</div>
          </body>
        </html>
      `;

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockHtml),
        })
      );

      render(<App />);
      const mockLink = setupDownloadMocks();

      const inputElement = screen.getByPlaceholderText(
        /Paste public ChatGPT\/Gemini\/Claude chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(mockLink.setAttribute).toHaveBeenCalledWith(
          "href",
          expect.stringContaining("data:text/json")
        );
        expect(mockLink.setAttribute).toHaveBeenCalledWith(
          "download",
          "chat.json"
        );
        expect(mockLink.click).toHaveBeenCalled();
      });
    });
  });
});
