# Gemini Streaming API (SSE Proxy)

This document explains how to use the Gemini Streaming API route provided in this project. It proxies Google GenAI Live API messages to the client via Server-Sent Events (SSE), supporting both text and audio modalities.

The implementation lives at `app/api/gemini-stream/route.ts` and exposes both `POST` and `GET` handlers that return SSE streams.

## Overview

- Streams Live API messages as SSE: events include `open`, `message`, `close`, `end`, and `error`.
- Supports text and audio responses via Google GenAI Live API.
- Default model: `models/gemini-2.5-flash-preview-native-audio-dialog` (overridable per request).

## Prerequisites

- Node.js 20 or later

- Install dependencies:

  ```bash
  pnpm add @google/genai mime
  pnpm add -D @types/node
  ```

- Set environment variables in your runtime (choose one path):

  ```bash
  # .env.local (for Next.js local dev)
  # Option A: Gemini Developer API key
  GOOGLE_API_KEY=your_api_key_here
  # (or legacy name supported by this route)
  GEMINI_API_KEY=your_api_key_here

  # Option B: Vertex AI (server-side), enable and configure
  GOOGLE_GENAI_USE_VERTEXAI=true
  GOOGLE_CLOUD_PROJECT=your_gcp_project
  GOOGLE_CLOUD_LOCATION=us-central1

  # Optional: select API version (v1 for stable, v1alpha for preview)
  GOOGLE_GENAI_API_VERSION=v1
  ```

## CORS configuration

This route supports configurable CORS for browser access across origins.

- `CORS_ALLOW_ORIGINS`: Comma-separated list of allowed origins or `*` for all.
- `CORS_ALLOW_CREDENTIALS`: Set to `true` to allow credentials. Note: credentials are not allowed with `*`.

Examples:

```bash
# Allow specific origins (recommended for production)
CORS_ALLOW_ORIGINS="https://app.example.com,https://admin.example.com"
CORS_ALLOW_CREDENTIALS=true

# Allow all origins (development only)
CORS_ALLOW_ORIGINS="*"
# (do not set CORS_ALLOW_CREDENTIALS with *)
```

## Endpoints

- Path: `/api/gemini-stream`
- Methods: `POST` and `GET`
- Response type: `text/event-stream` (SSE)

### Request Schema (TypeScript)

Defined in `app/api/gemini-stream/_requests.ts`:

```ts
export interface GeminiStreamRequest {
  // Prompt input to send as one or more turns to the Live API
  input?: string | string[];
  // Optional model override; defaults to 'models/gemini-2.5-flash-preview-native-audio-dialog'
  model?: string;
}
```

Behavior:
- If `input` is a string, it is sent as a single turn.
- If `input` is an array of strings, they are sent as multiple turns.
- If no `input` is provided or it is empty, a default `"Hello!"` turn is used.

### SSE Event Types

Defined in `app/api/gemini-stream/_responses.ts`:

```ts
export type GeminiSSEEvent =
  | { type: 'open' }
  | { type: 'message'; payload: unknown }
  | { type: 'close'; reason: string }
  | { type: 'end'; message?: unknown }
  | { type: 'error'; error: string };
```

Notes:
- `message.payload` is the raw `LiveServerMessage` from `@google/genai` (may include text/audio `inlineData`/`fileData`).
- When the server marks the turn as complete (`turnComplete`), the stream will be gracefully ended with an `end` event.

## Using the API (General)

### Option A: GET with `EventSource` (simple SSE consumption)

`EventSource` only supports GET requests. Use query parameters `input` (repeatable) and optional `model`.

```ts
// Example: Using EventSource in the browser
const params = new URLSearchParams();
params.append('input', 'Hello there!');
// Optional: params.append('model', 'models/gemini-2.5-flash-preview-native-audio-dialog');

const es = new EventSource(`/api/gemini-stream?${params.toString()}`);

es.onmessage = (ev) => {
  try {
    const evt = JSON.parse(ev.data) as
      | { type: 'open' }
      | { type: 'message'; payload: unknown }
      | { type: 'close'; reason: string }
      | { type: 'end'; message?: unknown }
      | { type: 'error'; error: string };

    switch (evt.type) {
      case 'open':
        console.log('Stream opened');
        break;
      case 'message':
        console.log('Live payload:', evt.payload);
        break;
      case 'close':
        console.log('Stream closing:', evt.reason);
        break;
      case 'end':
        console.log('Stream ended:', evt.message);
        es.close();
        break;
      case 'error':
        console.error('Stream error:', evt.error);
        es.close();
        break;
    }
  } catch (e) {
    console.error('Parse error:', e, ev.data);
  }
};

es.onerror = (e) => {
  console.error('EventSource error', e);
  es.close();
};
```

### Option B: POST with `fetch` streaming (manual SSE parsing)

`EventSource` does not support POST; use `fetch` and read the response body as a stream, parsing SSE frames (`\n\n` delimited) yourself.

```ts
async function postSSE(body: { input?: string | string[]; model?: string }) {
  const res = await fetch('/api/gemini-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!frame.startsWith('data:')) continue;
      const data = frame.slice('data:'.length).trim();
      if (!data) continue;
      try {
        const evt = JSON.parse(data);
        // Handle evt.type as in the GET example
        console.log('SSE event:', evt);
      } catch (e) {
        console.error('JSON parse error', e, data);
      }
    }
  }
}

// Usage
postSSE({ input: 'Describe the sky', model: undefined }).catch(console.error);
```

## Usage Within This Project

- Route implementation: `app/api/gemini-stream/route.ts`
  - Uses `@google/genai` to connect to the Live API via `ai.live.connect(...)`.
  - Streams `LiveServerMessage` payloads to clients via SSE.
  - Default voice: `Zephyr` (see `speechConfig` in the route).

- Types:
  - Request: `app/api/gemini-stream/_requests.ts` (`GeminiStreamRequest`)
  - SSE events: `app/api/gemini-stream/_responses.ts` (`GeminiSSEEvent`)
  - Custom errors: `app/api/gemini-stream/_exceptions.ts`

- Environment:
  - Ensure `GEMINI_API_KEY` is set in `.env.local` for development and in your hosting provider for production.

- Client integration (example in a React component):

```tsx
import React from 'react';

export function GeminiDemo() {
  const start = React.useCallback(() => {
    const params = new URLSearchParams();
    params.append('input', 'Hello!');
    const es = new EventSource(`/api/gemini-stream?${params.toString()}`);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        console.log('Event:', evt);
      } catch (e) {
        console.error(e);
      }
    };
    es.onerror = (e) => {
      console.error('SSE error', e);
      es.close();
    };
  }, []);

  return <button onClick={start}>Start Gemini Stream</button>;
}
```

## Error Handling

- If `GEMINI_API_KEY` is missing, the route returns `500` with `{ error: 'Missing GEMINI_API_KEY environment variable.' }`.
- Runtime errors will return `500` with `{ error: string }` JSON.
- During streaming, `error` events will be sent over SSE. The stream will then be closed.

## Troubleshooting

- Ensure the `Content-Type` response header is `text/event-stream` and that no proxy buffers the response. The route sets `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`.
- If you don’t receive events:
  - Verify `GEMINI_API_KEY` is valid and present.
  - Check browser console/network tab for SSE connection status.
  - Confirm the default model is available to your API key or override `model` in the request.
- For audio payloads, inspect `message.payload` for `inlineData`/`fileData` and handle decoding on the client.

## Notes

- Default model: `models/gemini-2.5-flash-preview-native-audio-dialog`.
- Response modalities configured: `TEXT` and `AUDIO`.
- Voice: `Zephyr` (modifiable in `speechConfig`).

## References

- Official SDK docs: https://googleapis.github.io/js-genai/

---

Last updated: 2025-09-09