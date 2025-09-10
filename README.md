# Gemini API Integration

This submodule enables real-time multimodal interactions with Google's GenAI Live API, supporting text, audio, and video modalities through streaming SSE endpoints.

## Key Capabilities

### 1. Multimodal Streaming

- **Text+Audio Streaming**: Simultaneous text transcriptions and audio responses
- **Video Frame Processing**: Analyze video frames via base64-encoded image data
- **Screen Content Analysis**: Process screenshots/screencasts using `mimeType: image/jpeg`

### 2. Voice-to-Voice Interaction

```mermaid
graph LR
  A[User Speech] --> B(Web Speech API)
  B --> C{Transcribe}
  C --> D[/Send text to /api/gemini-stream\]
  D --> E[Gemini Response]
  E --> F[Audio Payload]
  F --> G[AudioContext.play]
```

- Capture user speech with browser's `SpeechRecognition`
- Send transcribed text to SSE endpoint
- Handle audio responses in the client

```ts
// Play Gemini audio response
const audio = new Audio(`data:audio/wav;base64,${audioPayload}`);
audio.play();
```

---

### 3. Screen Access & Analysis

- Client-side capture: Use `getDisplayMedia()` for screen sharing
- Send frames: POST screenshots as base64 with `mimeType: image/jpeg`

**Example analysis prompts:**
- "Analyze this UI: What's the main call to action?"
- "Identify errors in this console output"
- "Summarize the content in this documentation screenshot"

---

## Usage

### Basic SSE Consumption

```tsx
// React component example
import { useGeminiStream } from '@/hooks/useGeminiStream';
import { useEffect } from 'react';

function VoiceChat() {
  const { start, stop, events } = useGeminiStream({
    input: 'Hello! How can I help?',
    method: 'POST'
  });

  // Handle audio responses
  useEffect(() => {
    const audioEvent = events.find(
      e => e.type === 'message' && e.payload?.audio
    );
    if (audioEvent) {
      const audio = new Audio(`data:audio/wav;base64,${audioEvent.payload.audio}`);
      audio.play();
    }
  }, [events]);
}
```

---

### Screen Analysis Request

```js
// Capture and send screenshot
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
// You need to implement captureVideoFrame to extract a frame as an image
const frame = await captureVideoFrame(stream); 

fetch('/api/gemini-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    input: 'Analyze this UI',
    assets: [{
      mimeType: 'image/jpeg',
      data: frame.toDataURL('image/jpeg')
    }]
  })
});
```

---

## Configuration

Set these environment variables: