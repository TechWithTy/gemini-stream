# cURL Examples for Gemini Streaming API

The following examples demonstrate how to stream SSE responses from the route at `/api/gemini-stream`.

Requirements:
- Server running locally on http://localhost:3000
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` (or Vertex AI envs) configured in your server environment
- Use `curl -N` to disable buffering for proper streaming

## GET (SSE via query params)

```bash
curl -N \
  -H "Accept: text/event-stream" \
  "http://localhost:3000/api/gemini-stream?input=Hello%20there!"
```

Notes:
- You can repeat `input` to send multiple turns:

```bash
curl -N \
  -H "Accept: text/event-stream" \
  "http://localhost:3000/api/gemini-stream?input=Hello&input=How%20are%20you%3F"
```

- Optionally override the model:

```bash
curl -N \
  -H "Accept: text/event-stream" \
  "http://localhost:3000/api/gemini-stream?input=Hello&model=models/gemini-2.5-flash-preview-native-audio-dialog"
```

## POST (SSE with JSON body)

```bash
curl -N \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"input":"Describe the sky"}' \
  http://localhost:3000/api/gemini-stream
```

Multiple turns and optional model override:

```bash
curl -N \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "input": ["Hello", "Please summarize our conversation."],
    "model": "models/gemini-2.5-flash-preview-native-audio-dialog"
  }' \
  http://localhost:3000/api/gemini-stream
```

## Tips

- If you see no output, ensure the server is running and that your API key or Vertex AI envs are correctly configured.
- SSE frames are delimited by a blank line. Each frame contains a `data: {json}` payload.
- You can pipe the output to `jq` for readability, but note that SSE lines contain the `data:` prefix:

```bash
curl -N "http://localhost:3000/api/gemini-stream?input=Hello" | sed 's/^data: //g' | jq .