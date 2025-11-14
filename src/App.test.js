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
        /Paste public Gemini chat URL here/i
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
        /This tool extracts conversation history from public Gemini share links./i
      );
      expect(helperText).toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    test("allows user to type in the URL input field", async () => {
      const user = userEvent.setup();
      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
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
        /Paste public Gemini chat URL here/i
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
        /Paste public Gemini chat URL here/i
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
          status: 500,
          json: () => Promise.resolve({ error: "Server error" }),
        })
      );

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(/Server error/i);
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("shows error when no chat data received", async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false }),
        })
      );

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        const errorElement = screen.getByText(
          /No chat data received from server/i
        );
        expect(errorElement).toBeInTheDocument();
      });
    });

    test("successfully downloads chat when API returns data", async () => {
      const mockData = {
        success: true,
        data: {
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ],
        },
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        })
      );

      render(<App />);
      const mockLink = setupDownloadMocks();

      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
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

    test("button shows 'Extracting...' during loading", async () => {
      let resolvePromise;
      const fetchPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      global.fetch = jest.fn(() => fetchPromise);

      render(<App />);
      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://example.com/chat");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(buttonElement).toHaveTextContent(/Extracting.../i);
        expect(buttonElement).toBeDisabled();
      });

      // Resolve the promise to clean up
      resolvePromise({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { messages: [] },
          }),
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
          json: () =>
            Promise.resolve({
              success: true,
              data: { messages: [] },
            }),
        })
      );

      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
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

  describe("API Integration", () => {
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

    test("calls backend API with correct URL and payload", async () => {
      const mockData = {
        success: true,
        data: {
          messages: [
            { role: "user", content: "Test message" },
            { role: "assistant", content: "Test response" },
          ],
        },
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        })
      );

      render(<App />);
      setupDownloadMocks();

      const inputElement = screen.getByPlaceholderText(
        /Paste public Gemini chat URL here/i
      );
      const buttonElement = screen.getByRole("button");

      await userEvent.type(inputElement, "https://g.co/gemini/share/123");
      fireEvent.click(buttonElement);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/extract"),
          expect.objectContaining({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: "https://g.co/gemini/share/123" }),
          })
        );
      });
    });
  });
});
