// * Custom exceptions for /api/gemini-stream

export class MissingApiKeyError extends Error {
	constructor() {
		super("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
		this.name = "MissingApiKeyError";
	}
}

export class LiveConnectError extends Error {
	constructor(message = "Failed to connect to Google GenAI Live API.") {
		super(message);
		this.name = "LiveConnectError";
	}
}

export class StreamAbortError extends Error {
	constructor(message = "Request aborted by the client.") {
		super(message);
		this.name = "StreamAbortError";
	}
}
