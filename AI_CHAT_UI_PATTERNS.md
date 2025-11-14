# AI Chat UI Patterns: Implementation Guide

Research on handling live Claude, Gemini, ChatGPT, and other AI streaming interfaces.

---

## Table of Contents

1. [Core Technologies](#core-technologies)
2. [Popular Libraries & SDKs](#popular-libraries--sdks)
3. [Implementation Patterns](#implementation-patterns)
4. [Streaming with SSE](#streaming-with-sse)
5. [Auto-Scroll Implementation](#auto-scroll-implementation)
6. [Multi-Provider Architecture](#multi-provider-architecture)
7. [Production Repositories](#production-repositories)
8. [Best Practices](#best-practices)

---

## Core Technologies

### Server-Sent Events (SSE)
**The standard for AI chat streaming**

- Lightweight, unidirectional server-to-client communication
- Native browser support via `EventSource` API
- Automatic reconnection with last-event-ID tracking
- Content-Type: `text/event-stream`
- Format: `data: {json}\n\n`

**Why SSE over WebSockets?**
- Perfect for one-way streaming (AI responses)
- Lower overhead and simpler implementation
- Built-in reconnection logic
- Works through most firewalls/proxies

### Alternative Technologies
- **WebSockets**: For bidirectional real-time features
- **Polling**: Fallback for restricted environments (not recommended)

---

## Popular Libraries & SDKs

### 1. Vercel AI SDK ⭐ (Most Popular)

**Features:**
- Unified API for OpenAI, Anthropic, Google, Mistral, and 20+ providers
- Built-in React hooks (`useChat`, `useCompletion`)
- Automatic streaming and state management
- Type-safe with TypeScript

**Installation:**
```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

**Basic Usage:**

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
  });

  return result.toDataStreamResponse();
}
```

```tsx
// components/Chat.tsx
'use client';
import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

**Multi-Provider Support:**
```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

// Switch providers easily
const result = await streamText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  // or: model: google('gemini-2.0-flash-exp'),
  messages,
});
```

---

### 2. Assistant-UI (Production-Ready Components)

**Features:**
- 400k+ monthly npm downloads
- Composable primitives (Radix-style)
- Built-in: streaming, auto-scroll, accessibility, markdown, code highlighting
- Works with AI SDK, LangGraph, or custom backends

**Installation:**
```bash
npx assistant-ui init
```

**Key Benefits:**
- Production-ready out of the box
- Fully customizable (not a black box)
- Handles edge cases (connection loss, retries, etc.)
- Optional managed backend (Assistant Cloud)

---

### 3. React Chat Stream Hook

Simple hook for adding word-by-word streaming to any React app.

```bash
npm install react-chat-stream
```

```tsx
import { useChatStream } from 'react-chat-stream';

function Chat() {
  const { messages, sendMessage } = useChatStream({
    endpoint: '/api/chat',
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
    </div>
  );
}
```

---

## Implementation Patterns

### Pattern 1: Direct SSE Implementation (No Library)

**Frontend (React):**
```tsx
import { useState, useEffect } from 'react';

function ChatWithSSE() {
  const [messages, setMessages] = useState<string[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');

  const sendMessage = (content: string) => {
    const eventSource = new EventSource(`/api/chat?message=${encodeURIComponent(content)}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.done) {
        setMessages(prev => [...prev, currentMessage]);
        setCurrentMessage('');
        eventSource.close();
      } else {
        setCurrentMessage(prev => prev + data.content);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      eventSource.close();
    };
  };

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
        {currentMessage && <div>{currentMessage}</div>}
      </div>
      <button onClick={() => sendMessage('Hello AI!')}>
        Send
      </button>
    </div>
  );
}
```

**Backend (Next.js API Route):**
```typescript
// app/api/chat/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const message = searchParams.get('message');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Replace with actual AI API call
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: message }],
            stream: true,
          }),
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

### Pattern 2: Custom useChat Hook

```tsx
// hooks/useChat.ts
import { useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content }]);
    setStreamingMessage('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content }] }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader');

      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        accumulated += chunk;
        setStreamingMessage(accumulated);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
      setStreamingMessage('');
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  return {
    messages,
    streamingMessage,
    isLoading,
    sendMessage,
  };
}
```

---

## Streaming with SSE

### Backend Implementation Examples

#### Express.js
```typescript
import express from 'express';
import OpenAI from 'openai';

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: req.query.message as string }],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});
```

#### FastAPI (Python)
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import anthropic
import json

app = FastAPI()
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

@app.post("/api/chat")
async def chat(message: str):
    async def generate():
        with client.messages.stream(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": message}],
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'content': text})}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

---

## Auto-Scroll Implementation

### Pattern 1: Basic useRef + useEffect
```tsx
import { useRef, useEffect } from 'react';

function ChatMessages({ messages }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-container">
      {messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
```

### Pattern 2: Custom Hook (Reusable)
```tsx
// hooks/useChatScroll.ts
import { useRef, useEffect, MutableRefObject } from 'react';

export function useChatScroll<T>(dependency: T): MutableRefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [dependency]);

  return ref;
}

// Usage
function Chat() {
  const { messages } = useChat();
  const scrollRef = useChatScroll(messages);

  return (
    <div ref={scrollRef} className="overflow-y-auto h-96">
      {messages.map(msg => <Message key={msg.id} {...msg} />)}
    </div>
  );
}
```

### Pattern 3: Smart Auto-Scroll (Stop When User Scrolls Up)
```tsx
import { useRef, useEffect, useState } from 'react';

function SmartScrollChat({ messages }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Check if user is at bottom
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setShouldAutoScroll(isAtBottom);
  };

  // Auto-scroll when new messages arrive (if enabled)
  useEffect(() => {
    if (shouldAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, shouldAutoScroll]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto h-96"
    >
      {messages.map(msg => <Message key={msg.id} {...msg} />)}
    </div>
  );
}
```

### Pattern 4: Intersection Observer (Advanced)
```tsx
import { useRef, useEffect } from 'react';

function AdvancedAutoScroll({ messages }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const isVisible = entries[0].isIntersecting;
        if (isVisible && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      },
      { threshold: 1.0 }
    );

    if (bottomRef.current) {
      observerRef.current.observe(bottomRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    // Scroll on new messages
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div ref={containerRef} className="overflow-y-auto h-96">
      {messages.map(msg => <Message key={msg.id} {...msg} />)}
      <div ref={bottomRef} />
    </div>
  );
}
```

---

## Multi-Provider Architecture

### Abstract Provider Interface
```typescript
// types/chat.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatProvider {
  name: string;
  streamChat(messages: ChatMessage[]): AsyncIterable<string>;
}

// providers/openai.ts
import OpenAI from 'openai';

export class OpenAIProvider implements ChatProvider {
  name = 'OpenAI';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4',
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) yield content;
    }
  }
}

// providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements ChatProvider {
  name = 'Anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const stream = await this.client.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: messages.filter(m => m.role !== 'system'),
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
}

// providers/google.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GoogleProvider implements ChatProvider {
  name = 'Google';
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContentStream({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}

// api/chat.ts
export async function POST(req: Request) {
  const { messages, provider } = await req.json();

  const providers: Record<string, ChatProvider> = {
    openai: new OpenAIProvider(process.env.OPENAI_API_KEY!),
    anthropic: new AnthropicProvider(process.env.ANTHROPIC_API_KEY!),
    google: new GoogleProvider(process.env.GOOGLE_API_KEY!),
  };

  const selectedProvider = providers[provider] || providers.openai;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of selectedProvider.streamChat(messages)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## Production Repositories

### 1. Chatbot UI (mckaywrigley/chatbot-ui)
- **Tech**: Next.js, TypeScript, Supabase
- **Providers**: OpenAI, Azure OpenAI, local Ollama
- **Features**: Auth, persistent storage, responsive mobile
- **Status**: V2 in active development
- **GitHub**: https://github.com/mckaywrigley/chatbot-ui

### 2. Vercel AI Chatbot (supabase-community/vercel-ai-chatbot)
- **Tech**: Next.js, Vercel AI SDK, Supabase
- **Providers**: Multiple via AI SDK
- **Features**: Full auth system, persistent chats, analytics
- **GitHub**: https://github.com/supabase-community/vercel-ai-chatbot

### 3. ChatGPT-UI (dvcrn/chatgpt-ui)
- **Tech**: Elixir, Phoenix LiveView
- **Providers**: OpenAI, Claude, Gemini
- **Features**: Real-time updates, auth
- **GitHub**: https://github.com/dvcrn/chatgpt-ui

### 4. Next AI LangChain (AsharibAli/next-ai-langchain)
- **Tech**: Next.js, Vercel AI SDK, LangChain
- **Providers**: OpenAI
- **Features**: RAG, streaming, document processing
- **GitHub**: https://github.com/AsharibAli/next-ai-langchain

### 5. Assistant-UI Examples
- **Tech**: React, TypeScript
- **Integration**: AI SDK, LangGraph
- **GitHub**: https://github.com/assistant-ui/assistant-ui

---

## Best Practices

### 1. **Error Handling**
```tsx
const { messages, error, reload } = useChat({
  onError: (error) => {
    console.error('Chat error:', error);
    // Show user-friendly message
    toast.error('Failed to send message. Please try again.');
  },
});

// Retry logic
if (error) {
  return (
    <div>
      <p>Something went wrong</p>
      <button onClick={() => reload()}>Retry</button>
    </div>
  );
}
```

### 2. **Loading States**
```tsx
function Chat() {
  const { isLoading, stop } = useChat();

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2">
          <Spinner />
          <span>AI is thinking...</span>
          <button onClick={stop}>Stop</button>
        </div>
      )}
    </div>
  );
}
```

### 3. **Markdown Rendering**
```tsx
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

function Message({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### 4. **Rate Limiting**
```typescript
// middleware/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
});

export async function checkRateLimit(userId: string) {
  const { success, limit, remaining, reset } = await ratelimit.limit(userId);

  if (!success) {
    throw new Error('Rate limit exceeded');
  }

  return { limit, remaining, reset };
}
```

### 5. **Context Management**
```typescript
// Handle large contexts efficiently
const MAX_CONTEXT_MESSAGES = 20;

function trimContext(messages: Message[]) {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }

  // Keep system message + recent messages
  const systemMessage = messages.find(m => m.role === 'system');
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

  return systemMessage
    ? [systemMessage, ...recentMessages]
    : recentMessages;
}
```

### 6. **Retry Logic with Exponential Backoff**
```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // Don't retry on client errors
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
```

### 7. **Security Considerations**
```typescript
// Never expose API keys to client
// Use environment variables and server-side routes

// Rate limiting
// Input validation
// Content moderation
// User authentication

// Example: Server-side validation
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = await req.json();

  // Validate input
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Invalid messages', { status: 400 });
  }

  // Check rate limit
  await checkRateLimit(session.user.id);

  // ... proceed with chat
}
```

### 8. **Accessibility**
```tsx
function Chat() {
  const { messages } = useChat();

  return (
    <div role="log" aria-live="polite" aria-label="Chat messages">
      {messages.map(msg => (
        <div
          key={msg.id}
          role="article"
          aria-label={`${msg.role} message`}
        >
          <span className="sr-only">{msg.role}:</span>
          {msg.content}
        </div>
      ))}
    </div>
  );
}
```

---

## Quick Start Templates

### Minimal Next.js + OpenAI
```bash
npx create-next-app@latest my-chat-app
cd my-chat-app
npm install ai openai
```

```typescript
// app/api/chat/route.ts
import { StreamingTextResponse, OpenAIStream } from 'ai';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages,
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
```

```tsx
// app/page.tsx
'use client';
import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();
  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.role}: {m.content}</div>)}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

## Resources

### Official Documentation
- **Vercel AI SDK**: https://ai-sdk.dev/docs
- **Assistant-UI**: https://assistant-ui.com
- **OpenAI API**: https://platform.openai.com/docs
- **Anthropic API**: https://docs.anthropic.com
- **Google AI**: https://ai.google.dev/docs

### Community Resources
- **GitHub Topics**:
  - https://github.com/topics/react-chatbot
  - https://github.com/topics/ai-chat
- **Dev.to Tutorials**: Search "SSE React streaming chat"
- **Stack Overflow**: Tag `[react] [streaming] [sse]`

### Example Repositories
All repositories mentioned in "Production Repositories" section above.

---

## Conclusion

**Recommended Stack for 2025:**
1. **Frontend**: React/Next.js + TypeScript
2. **SDK**: Vercel AI SDK (easiest) or Assistant-UI (most complete)
3. **Streaming**: SSE via built-in SDK support
4. **Backend**: Next.js API routes or FastAPI (Python)
5. **Database**: Supabase (Postgres) or Vercel Postgres
6. **Deployment**: Vercel, Cloudflare, or self-hosted

**Key Takeaways:**
- Use SSE for streaming (not WebSockets unless needed)
- Vercel AI SDK handles 90% of edge cases
- Always implement smart auto-scroll
- Abstract provider logic for multi-AI support
- Handle errors gracefully with retry logic
- Implement rate limiting and auth server-side
- Never expose API keys to the client

This guide covers patterns used by production applications handling millions of AI chat messages daily.
