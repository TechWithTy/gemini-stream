// * Request types for /api/gemini-stream

export interface GeminiStreamRequest {
	// * Prompt input to send as one or more turns to the Live API
	input?: string | string[];
	// * Optional model override; defaults to 'models/gemini-2.5-flash-preview-native-audio-dialog'
	model?: string;
}

export type PostBody = GeminiStreamRequest;
