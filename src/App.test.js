import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

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
