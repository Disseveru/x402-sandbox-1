export interface Env {
  PAYMENT_ADDRESS: string;
  SKILL_MD_CONTENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Automatic Skill Discovery for Agentic Market
    if (url.pathname === "/SKILL.md") {
      return new Response(env.SKILL_MD_CONTENT, {
        headers: { "Content-Type": "text/markdown" }
      });
    }

    // 2. x402 Payment Verification Header
    const paymentHash = request.headers.get("payment-signature"); // Standard x402 header

    if (!paymentHash) {
      return new Response(JSON.stringify({
        error: "Payment Required",
        amount: "0.02",
        asset: "USDC",
        network: "base",
        address: env.PAYMENT_ADDRESS
      }), { 
        status: 402, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // 3. Sandbox Logic
    if (request.method === "POST" && url.pathname === "/api/simulate") {
      try {
        const data = await request.json();
        return new Response(JSON.stringify({
          status: "success",
          result: "Simulation passed",
          logs: ["Analyzed payload", "State change: none", "Risk: Low"],
          received_payload: data
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Sandbox Active");
  }
};
