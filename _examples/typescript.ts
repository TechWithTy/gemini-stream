// Example: How to consume POST-based SSE from /api/gemini-stream in the browser

type GeminiSSEEvent =
	| { type: "open" }
	| { type: "message"; payload: unknown }
	| { type: "close"; reason: string }
	| { type: "end"; message?: unknown }
	| { type: "error"; error: string };

export async function runGeminiStreamExample() {
	const res = await fetch("/api/gemini-stream", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ input: "Say a short greeting, then end the turn." }),
	});

	if (!res.ok || !res.body) {
		throw new Error(`Stream failed: ${res.status}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder("utf-8");

	let buffer = "";
	const onEvent = (evt: GeminiSSEEvent) => {
		console.log("[gemini-stream]", evt);
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let idx: number = buffer.indexOf("\n\n");
		while (idx !== -1) {
			const chunk = buffer.slice(0, idx).trim();
			buffer = buffer.slice(idx + 2);
			if (chunk.startsWith("data:")) {
				const json = chunk.replace(/^data:\s*/, "");
				try {
					const evt = JSON.parse(json) as GeminiSSEEvent;
					onEvent(evt);
				} catch (e) {
					console.warn("Failed to parse event", e, { chunk });
				}
			}
			idx = buffer.indexOf("\n\n");
		}
	}
}
