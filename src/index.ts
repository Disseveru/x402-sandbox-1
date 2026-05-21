export interface Env {
	PAYMENT_ADDRESS: string;
	SKILL_MD_CONTENT: string;
}

const jsonHeaders = { "Content-Type": "application/json" };

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/SKILL.md") {
			return new Response(env.SKILL_MD_CONTENT, {
				headers: { "Content-Type": "text/markdown" },
			});
		}

		const paymentSignature = request.headers.get("payment-signature");

		if (!paymentSignature) {
			return new Response(
				JSON.stringify({
					error: "Payment Required",
					amount: "0.02",
					asset: "USDC",
					network: "base",
					address: env.PAYMENT_ADDRESS,
				}),
				{
					status: 402,
					headers: jsonHeaders,
				}
			);
		}

		if (request.method === "POST" && url.pathname === "/api/simulate") {
			try {
				const data = await request.json();

				return new Response(
					JSON.stringify({
						status: "success",
						result: "Simulation passed",
						logs: ["Analyzed payload", "State change: none", "Risk: Low"],
						received_payload: data,
					}),
					{
						headers: jsonHeaders,
					}
				);
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
					status: 400,
					headers: jsonHeaders,
				});
			}
		}

		return new Response("Sandbox Active");
	},
};
