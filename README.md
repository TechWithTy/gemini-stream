# Gemini API Integration

This submodule provides streaming SSE API endpoints for Google's GenAI Live API, including route handlers, client adapters, and health checks.

## Features
- POST/GET SSE endpoints for Gemini streaming
- CORS support with environment configuration
- Client health checks (`?health=1`)
- Typed React hooks for client consumption
- Provider switching integration
- Error handling and auto-fallback

## Usage
```ts
// Example: Using the Gemini SSE route
fetch('/api/gemini-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'Hello Gemini!' })
});
```

## Configuration
Set these environment variables:
```env
# Gemini Developer API
GOOGLE_API_KEY=your_api_key

# OR Vertex AI
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your_project
GOOGLE_CLOUD_LOCATION=us-central1

# CORS (optional)
CORS_ALLOW_ORIGINS="https://your-app.com"
CORS_ALLOW_CREDENTIALS=true
```

## Project Structure
- `route.ts` - Main API route handlers
- `_docs/` - Usage documentation
- `_examples/` - Curl and TypeScript examples
- `_tests/` - Integration tests
- `_requests.ts` - Request schemas
- `_responses.ts` - SSE event types

## Maintenance
To update this submodule:
```bash
git submodule update --remote --merge
```

See the [submodule repository](https://github.com/techwithty/gemini-api-integration) for full documentation.
