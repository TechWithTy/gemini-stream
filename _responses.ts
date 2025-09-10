// * Response/SSE event types for /api/gemini-stream

export type GeminiSSEEvent =
	| { type: "open" }
	| { type: "message"; payload: unknown }
	| { type: "close"; reason: string }
	| { type: "end"; message?: unknown }
	| { type: "error"; error: string };
