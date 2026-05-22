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
			NETWORK: "base",
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
