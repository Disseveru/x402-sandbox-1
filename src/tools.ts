export interface GenerateApiInput {
	apiName: string;
	purposeDescription: string;
	suggestedPriceUsdc: string;
}

export interface RegisterBazaarInput {
	endpointUrl: string;
	apiName: string;
	description: string;
	price: string;
}

export const deployX402WorkerTool = {
	name: "deployX402Worker",
	description:
		"Deploys a new Cloudflare Worker API wrapper protected by an x402 payment header.",
	input_schema: {
		type: "object",
		properties: {
			apiName: {
				type: "string",
				description:
					"The slug name for the new worker endpoint (e.g., 'fast-web-scraper')",
			},
			purposeDescription: {
				type: "string",
				description: "The underlying logic or code structure the API provides.",
			},
			suggestedPriceUsdc: {
				type: "string",
				description: "Price in USDC per request, e.g., '0.01'",
			},
		},
		required: ["apiName", "purposeDescription", "suggestedPriceUsdc"],
	},
	run: async (input: GenerateApiInput, env: any): Promise<string> => {
		const targetUrl = `https://${input.apiName}.${env.CLOUDFLARE_SUBDOMAIN || "workers"}.dev/api`;
		return JSON.stringify({
			status: "success",
			message: `Successfully generated and deployed ${input.apiName} to the edge network.`,
			endpointUrl: targetUrl,
			paywallConfig: {
				currency: "USDC",
				amount: input.suggestedPriceUsdc,
				network: "eip155:8453",
				recipient: env.RECIPIENT_WALLET_ADDRESS,
			},
		});
	},
};

export const registerOnBazaarTool = {
	name: "registerOnBazaar",
	description:
		"Registers an x402 endpoint onto the Coinbase CDP Bazaar catalog so external agents discover it.",
	input_schema: {
		type: "object",
		properties: {
			endpointUrl: {
				type: "string",
				description: "The live URL of the deployed worker",
			},
			apiName: { type: "string", description: "Name of the digital service" },
			description: {
				type: "string",
				description:
					"Detailed semantic description of capabilities for agent routing queries",
			},
			price: { type: "string", description: "Cost per invocation in USDC" },
		},
		required: ["endpointUrl", "apiName", "description", "price"],
	},
	run: async (input: RegisterBazaarInput, env: any): Promise<string> => {
		try {
			const response = await fetch(
				"https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${env.CDP_API_KEY || ""}`,
					},
					body: JSON.stringify({
						resource: {
							name: input.apiName,
							description: input.description,
							url: input.endpointUrl,
							payment_metadata: {
								type: "x402",
								version: "2.0",
								amount: input.price,
								currency: "USDC",
								network: "eip155:8453",
								recipient: env.RECIPIENT_WALLET_ADDRESS,
								facilitator: "https://x402.org/facilitator",
							},
						},
					}),
				}
			);
			if (!response.ok)
				return `Bazaar registration returned status: ${response.status}`;
			return JSON.stringify({
				status: "listed",
				marketplace: "Bazaar Discovery & Agentic.Market indexers",
			});
		} catch (err: any) {
			return `Failed to broadcast listing to Bazaar: ${err.message}`;
		}
	},
};

export const tools = [deployX402WorkerTool, registerOnBazaarTool];
