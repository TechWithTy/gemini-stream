// ! Gemini Streaming API (SSE proxy)
// todo: Ensure you have installed: pnpm add @google/genai mime && pnpm add -D @types/node
// * This route streams Live API messages from Google GenAI to the client as SSE.

import { GoogleGenAI, MediaResolution, Modality } from "@google/genai";
import type { LiveServerMessage } from "@google/genai";
import type { PostBody } from "./_requests";

export const runtime = "nodejs";

// * Using PostBody type from ./_requests

// ? Utility: format an SSE event
function sseEvent(data: unknown): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

// ? Utility: standard CORS headers
function parseAllowedOrigins(): string[] | "*" {
	const raw = process.env.CORS_ALLOW_ORIGINS?.trim();
	if (!raw || raw === "*") return "*";
	const parts = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return parts.length ? parts : "*";
}

function corsHeaders(origin?: string) {
	const allowList = parseAllowedOrigins();
	const allowCredentials = process.env.CORS_ALLOW_CREDENTIALS === "true";
	const h = new Headers();
	h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	h.set("Access-Control-Max-Age", "86400");

	if (allowList === "*") {
		// Credentials cannot be used with wildcard per spec
		h.set("Access-Control-Allow-Origin", "*");
	} else {
		const isAllowed = origin && allowList.includes(origin);
		if (isAllowed && origin) {
			h.set("Access-Control-Allow-Origin", origin);
			h.set("Vary", "Origin");
		}
	}

	if (allowCredentials) {
		h.set("Access-Control-Allow-Credentials", "true");
	}

	return h;
}

export async function OPTIONS(req: Request): Promise<Response> {
	// Preflight response
	const headers = corsHeaders(req.headers.get("origin") || undefined);
	return new Response(null, { status: 204, headers });
}

// ? Utility: create a configured GoogleGenAI client
function createGenAI(): GoogleGenAI | never {
	const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
	const apiVersion = process.env.GOOGLE_GENAI_API_VERSION as
		| "v1"
		| "v1alpha"
		| undefined;

	if (useVertex) {
		const project = process.env.GOOGLE_CLOUD_PROJECT;
		const location = process.env.GOOGLE_CLOUD_LOCATION;
		if (!project || !location) {
			throw new Error(
				"Vertex AI mode enabled (GOOGLE_GENAI_USE_VERTEXAI=true) but GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_LOCATION is missing.",
			);
		}
		// * Using `any` here because current @google/genai typings may not expose all documented options
		// * across channels; we pass through documented fields safely for runtime while keeping TS happy.
		// biome-ignore lint/suspicious/noExplicitAny: SDK options union is not fully exposed in typings
		const opts: any = { vertexai: true, project, location };
		if (apiVersion) opts.apiVersion = apiVersion;
		return new GoogleGenAI(opts);
	}

	const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error(
			"Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.",
		);
	}
	// * Using `any` here for the same reason as above (see note).
	// biome-ignore lint/suspicious/noExplicitAny: SDK options union is not fully exposed in typings
	const opts: any = { apiKey };
	if (apiVersion) opts.apiVersion = apiVersion;
	return new GoogleGenAI(opts);
}

export async function POST(req: Request): Promise<Response> {
	try {
		// Initialize SDK client (supports Vertex AI or API key via env)
		let ai: GoogleGenAI;
		try {
			ai = createGenAI();
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : "Client initialization error";
			return new Response(JSON.stringify({ error: msg }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		}

		const { input, model: modelOverride } = (await req
			.json()
			.catch(() => ({}))) as PostBody;

		const model =
			modelOverride ?? "models/gemini-2.5-flash-preview-native-audio-dialog";

		// Normalize input to an array of turns
		const turns = Array.isArray(input)
			? input
			: typeof input === "string" && input.length > 0
				? [input]
				: ["Hello!"];

		// ai created above

		const stream = new TransformStream();
		const writer = stream.writable.getWriter();

		// Close helpers
		const closeWith = async (message?: unknown) => {
			try {
				if (message) await writer.write(sseEvent({ type: "end", message }));
			} catch (_) {
				// ignore
			}
			try {
				await writer.close();
			} catch (_) {
				// ignore
			}
		};

		// Start Live session
		const session = await ai.live.connect({
			model,
			config: {
				responseModalities: [Modality.AUDIO, Modality.TEXT],
				mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
				speechConfig: {
					voiceConfig: {
						prebuiltVoiceConfig: { voiceName: "Zephyr" },
					},
				},
				contextWindowCompression: {
					triggerTokens: "25600",
					slidingWindow: { targetTokens: "12800" },
				},
			},
			callbacks: {
				onopen: async () => {
					await writer.write(sseEvent({ type: "open" }));
				},
				onmessage: async (message: LiveServerMessage) => {
					// Forward raw messages (client can handle text/audio inlineData/fileData)
					await writer.write(sseEvent({ type: "message", payload: message }));

					// If server indicates turn is complete, close the stream
					if (message.serverContent?.turnComplete) {
						try {
							session.close();
						} catch (_) {
							// ignore
						}
						await closeWith("turn_complete");
					}
				},
				onerror: async (e: ErrorEvent) => {
					await writer.write(sseEvent({ type: "error", error: e.message }));
					try {
						session.close();
					} catch (_) {
						// ignore
					}
					await closeWith("error");
				},
				onclose: async (e: CloseEvent) => {
					await writer.write(sseEvent({ type: "close", reason: e.reason }));
					await closeWith("closed");
				},
			},
		});

		// Send initial turns
		session.sendClientContent({ turns });

		// Abort handling (if client disconnects)
		const abort = req.signal;
		abort.addEventListener("abort", () => {
			try {
				session.close();
			} catch (_) {
				// ignore
			}
			// Writer will be closed by onclose callback
		});

		const headers = corsHeaders(req.headers.get("origin") || undefined);
		headers.set("Content-Type", "text/event-stream; charset=utf-8");
		headers.set("Cache-Control", "no-cache, no-transform");
		headers.set("Connection", "keep-alive");
		headers.set("X-Accel-Buffering", "no"); // for nginx proxies

		return new Response(stream.readable, { headers, status: 200 });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		const headers = corsHeaders(req.headers.get("origin") || undefined);
		headers.set("content-type", "application/json");
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers,
		});
	}
}

// * GET handler to support EventSource clients (uses query params: input, model)
export async function GET(req: Request): Promise<Response> {
	try {
		// Initialize SDK client (supports Vertex AI or API key via env)
		let ai: GoogleGenAI;
		try {
			ai = createGenAI();
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : "Client initialization error";
			const headers = corsHeaders(req.headers.get("origin") || undefined);
			headers.set("content-type", "application/json");
			return new Response(JSON.stringify({ error: msg }), {
				status: 500,
				headers,
			});
		}

		const url = new URL(req.url);
		// Health check: verify configuration AND perform a real API check for API key mode
		if (url.searchParams.get("health") === "1") {
			const headers = corsHeaders(req.headers.get("origin") || undefined);
			try {
				const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
				if (useVertex) {
					// For Vertex AI we validate required envs are present; a full token check requires ADC and scopes.
					const project = process.env.GOOGLE_CLOUD_PROJECT;
					const location = process.env.GOOGLE_CLOUD_LOCATION;
					if (!project || !location) {
						headers.set("content-type", "application/json");
						return new Response(
							JSON.stringify({
								error: "Missing GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_LOCATION",
							}),
							{ status: 500, headers },
						);
					}
					return new Response(null, { status: 204, headers });
				}

				const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
				if (!apiKey) {
					headers.set("content-type", "application/json");
					return new Response(
						JSON.stringify({
							error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY",
						}),
						{ status: 500, headers },
					);
				}
				const ver = (process.env.GOOGLE_GENAI_API_VERSION || "v1").replace(
					/^v(\d)(.*)$/,
					"v$1$2",
				);
				const checkUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(apiKey)}`;
				const resp = await fetch(checkUrl, {
					method: "GET",
					cache: "no-store",
				});
				if (resp.ok) {
					return new Response(null, { status: 204, headers });
				}
				headers.set("content-type", "application/json");
				const text = await resp.text().catch(() => "");
				return new Response(
					JSON.stringify({
						error: `Google API health failed: ${resp.status}`,
						body: text.slice(0, 300),
					}),
					{ status: 500, headers },
				);
			} catch (e) {
				headers.set("content-type", "application/json");
				return new Response(JSON.stringify({ error: (e as Error).message }), {
					status: 500,
					headers,
				});
			}
		}

		const modelOverride = url.searchParams.get("model") ?? undefined;
		const input = url.searchParams.getAll("input");

		const model =
			modelOverride ?? "models/gemini-2.5-flash-preview-native-audio-dialog";
		const turns = input.length > 0 ? input : ["Hello!"];

		const stream = new TransformStream();
		const writer = stream.writable.getWriter();

		const sseEventLocal = (data: unknown) =>
			`data: ${JSON.stringify(data)}\n\n`;
		const closeWith = async (message?: unknown) => {
			try {
				if (message)
					await writer.write(sseEventLocal({ type: "end", message }));
			} catch {}
			try {
				await writer.close();
			} catch {}
		};

		const session = await ai.live.connect({
			model,
			config: {
				responseModalities: [Modality.AUDIO, Modality.TEXT],
				mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
				speechConfig: {
					voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
				},
				contextWindowCompression: {
					triggerTokens: "25600",
					slidingWindow: { targetTokens: "12800" },
				},
			},
			callbacks: {
				onopen: async () => {
					await writer.write(sseEventLocal({ type: "open" }));
				},
				onmessage: async (message: LiveServerMessage) => {
					await writer.write(
						sseEventLocal({ type: "message", payload: message }),
					);
					if (message.serverContent?.turnComplete) {
						try {
							session.close();
						} catch {}
						await closeWith("turn_complete");
					}
				},
				onerror: async (e: ErrorEvent) => {
					await writer.write(
						sseEventLocal({ type: "error", error: e.message }),
					);
					try {
						session.close();
					} catch {}
					await closeWith("error");
				},
				onclose: async (e: CloseEvent) => {
					await writer.write(
						sseEventLocal({ type: "close", reason: e.reason }),
					);
					await closeWith("closed");
				},
			},
		});

		session.sendClientContent({ turns });

		req.signal.addEventListener("abort", () => {
			try {
				session.close();
			} catch {}
		});

		const headers = corsHeaders(req.headers.get("origin") || undefined);
		headers.set("Content-Type", "text/event-stream; charset=utf-8");
		headers.set("Cache-Control", "no-cache, no-transform");
		headers.set("Connection", "keep-alive");
		headers.set("X-Accel-Buffering", "no");

		return new Response(stream.readable, { headers, status: 200 });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		const headers = corsHeaders(req.headers.get("origin") || undefined);
		headers.set("content-type", "application/json");
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers,
		});
	}
}
