import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveServerMessage } from "@google/genai";
import type { GeminiSSEEvent } from "../_responses";

// Unit under test
import { POST } from "../route";

// Utilities
async function readSSE(response: Response): Promise<GeminiSSEEvent[]> {
	const events: GeminiSSEEvent[] = [];
	const reader = response.body?.getReader();
	if (!reader) return events;
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let idx = buffer.indexOf("\n\n");
		while (idx !== -1) {
			const chunk = buffer.slice(0, idx).trim();
			buffer = buffer.slice(idx + 2);
			if (chunk.startsWith("data:")) {
				const json = chunk.replace(/^data:\s*/, "");
				try {
					events.push(JSON.parse(json) as GeminiSSEEvent);
				} catch {
					// ignore parse errors
				}
			}
			idx = buffer.indexOf("\n\n");
		}
	}
	return events;
}

// Mock @google/genai
vi.mock("@google/genai", () => {
	type Callbacks = {
		onopen?: () => void | Promise<void>;
		onmessage?: (message: LiveServerMessage) => void | Promise<void>;
		onerror?: (e: ErrorEvent) => void | Promise<void>;
		onclose?: (e: CloseEvent) => void | Promise<void>;
	};

	class FakeSession {
		callbacks: Callbacks;
		constructor(callbacks: Callbacks) {
			this.callbacks = callbacks;
		}
		sendClientContent() {
			// simulate server lifecycle
			// open -> message -> turnComplete -> close
			queueMicrotask(async () => {
				this.callbacks?.onopen?.();
				this.callbacks?.onmessage?.({
					serverContent: { modelTurn: { parts: [{ text: "hi" }] } },
				});
				this.callbacks?.onmessage?.({ serverContent: { turnComplete: true } });
				this.callbacks?.onclose?.({ reason: "done" } as CloseEvent);
			});
		}
		close() {
			// noop
		}
	}

	return {
		GoogleGenAI: class {
			live = {
				connect: async ({ callbacks }: { callbacks: Callbacks }) =>
					new FakeSession(callbacks),
			};
			constructor(_: { apiKey: string }) {}
		},
		Modality: { TEXT: "TEXT", AUDIO: "AUDIO" },
		MediaResolution: { MEDIA_RESOLUTION_MEDIUM: "MEDIA_RESOLUTION_MEDIUM" },
	};
});

describe("POST /api/gemini-stream", () => {
	const OLD_ENV = process.env;

	beforeEach(() => {
		vi.restoreAllMocks();
		process.env = { ...OLD_ENV } as NodeJS.ProcessEnv;
	});

	afterEach(() => {
		process.env = OLD_ENV;
	});

	it("returns 500 when no API key env is provided", async () => {
		process.env.GEMINI_API_KEY = undefined as unknown as string;
		process.env.GOOGLE_API_KEY = undefined as unknown as string;
		const req = new Request("http://test/api/gemini-stream", {
			method: "POST",
			body: JSON.stringify({ input: "hello" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error).toMatch(/GOOGLE_API_KEY|GEMINI_API_KEY/);
	});

	it("streams events for happy path", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const req = new Request("http://test/api/gemini-stream", {
			method: "POST",
			body: JSON.stringify({ input: "hello" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const events = await readSSE(res);
		const types = events.map((e) => e.type);
		expect(types).toContain("open");
		expect(types).toContain("message");
		expect(types).toContain("end");
	});

	it("handles error callback", async () => {
		// override mock to emit error
		const mod = await import("@google/genai");
		const GoogleGenAI = (mod as unknown as { GoogleGenAI: any }).GoogleGenAI;
		GoogleGenAI.prototype.live.connect = async ({
			callbacks,
		}: {
			callbacks: {
				onopen?: () => void | Promise<void>;
				onmessage?: (message: LiveServerMessage) => void | Promise<void>;
				onerror?: (e: ErrorEvent) => void | Promise<void>;
				onclose?: (e: CloseEvent) => void | Promise<void>;
			};
		}) => {
			return {
				sendClientContent: () => {
					queueMicrotask(() => {
						callbacks?.onopen?.();
						callbacks?.onerror?.({ message: "boom" } as ErrorEvent);
						callbacks?.onclose?.({ reason: "error" } as CloseEvent);
					});
				},
				close: () => {},
			};
		};

		process.env.GEMINI_API_KEY = "test-key";
		const req = new Request("http://test/api/gemini-stream", {
			method: "POST",
			body: JSON.stringify({ input: "hello" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		const events = await readSSE(res);
		const types = events.map((e) => e.type);
		expect(types).toContain("error");
		expect(types).toContain("close");
	});
});
