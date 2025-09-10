import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { OPTIONS, POST } from "../route";

describe("CORS handling for /api/gemini-stream", () => {
	const OLD_ENV = process.env;
	const origin = "https://app.example.com";

	beforeEach(() => {
		process.env = { ...OLD_ENV } as NodeJS.ProcessEnv;
	});

	afterEach(() => {
		process.env = OLD_ENV;
	});

	it("allows specific origin from CORS_ALLOW_ORIGINS for OPTIONS", async () => {
		process.env.CORS_ALLOW_ORIGINS = origin; // single allowed origin
		const req = new Request("http://test/api/gemini-stream", {
			method: "OPTIONS",
			headers: { origin },
		});
		const res = await OPTIONS(req);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
		expect(res.headers.get("Vary")).toBe("Origin");
	});

	it('returns wildcard for OPTIONS when CORS_ALLOW_ORIGINS is "*"', async () => {
		process.env.CORS_ALLOW_ORIGINS = "*";
		const req = new Request("http://test/api/gemini-stream", {
			method: "OPTIONS",
			headers: { origin },
		});
		const res = await OPTIONS(req);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("includes CORS headers in POST error responses", async () => {
		delete (process.env as any).GOOGLE_API_KEY;
		delete (process.env as any).GEMINI_API_KEY;
		process.env.CORS_ALLOW_ORIGINS = origin;

		const req = new Request("http://test/api/gemini-stream", {
			method: "POST",
			headers: { "Content-Type": "application/json", origin },
			body: JSON.stringify({ input: "hi" }),
		});
		const res = await POST(req);
		expect(res.status).toBe(500);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
		expect(res.headers.get("Vary")).toBe("Origin");
	});
});
