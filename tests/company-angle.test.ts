import assert from "node:assert/strict";
import test from "node:test";
import app, {
	enforceSingleSentence,
	validateCompanyAngleRequest,
} from "../src/index";

test("validateCompanyAngleRequest requires at least one supported field", () => {
	const result = validateCompanyAngleRequest({});
	assert.equal(Boolean(result.error), true);
});

test("enforceSingleSentence keeps only one sentence", () => {
	const result = enforceSingleSentence(
		"This is the first sentence. This second sentence should be removed."
	);
	assert.equal(result, "This is the first sentence.");
});

test("POST /v1/company-angle requires payment and returns 402 when unpaid", async () => {
	const response = await app.request(
		"http://localhost/v1/company-angle",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ company_name: "Acme" }),
		},
		{
			PAY_TO: "0x000000000000000000000000000000000000dEaD",
			NETWORK: "base-sepolia",
			PROTECTED_PATTERNS: [
				{
					pattern: "/v1/company-angle",
					price: "$0.01",
					description:
						"Generate one actionable company outreach or action angle",
				},
			],
			FACILITATOR_URL: "https://x402.org/facilitator",
			XAI_API_KEY: "test",
		}
	);

	assert.equal(response.status, 402);
});

test("requestCompanyAngleFromXai enforces one sentence from XAI output", async () => {
	const originalFetch = globalThis.fetch;

	try {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content:
									"First actionable sentence. Another sentence that should be removed.",
							},
						},
					],
				}),
				{ status: 200 }
			)) as typeof fetch;

		const { requestCompanyAngleFromXai } = await import("../src/index");
		const summary = await requestCompanyAngleFromXai(
			{
				PAY_TO: "0x000000000000000000000000000000000000dEaD",
				NETWORK: "base-sepolia",
				PROTECTED_PATTERNS: [],
				FACILITATOR_URL: "https://x402.org/facilitator",
				XAI_MODEL: "grok-3-mini",
				XAI_API_KEY: "test",
			},
			{ company_name: "Acme" }
		);

		assert.equal(summary, "First actionable sentence.");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("requestCompanyAngleFromXai rejects missing XAI key", async () => {
	const { requestCompanyAngleFromXai } = await import("../src/index");

	await assert.rejects(
		requestCompanyAngleFromXai(
			{
				PAY_TO: "0x000000000000000000000000000000000000dEaD",
				NETWORK: "base-sepolia",
				PROTECTED_PATTERNS: [],
				FACILITATOR_URL: "https://x402.org/facilitator",
				XAI_MODEL: "grok-3-mini",
				XAI_API_KEY: "",
			},
			{ company_name: "Acme" }
		),
		/XAI API key is not configured/
	);
});
