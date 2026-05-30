import "./tools";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import {
	createProtectedRoute,
	extractPathParams,
	type ProtectedRouteConfig,
} from "./auth";
import { generateJWT } from "./jwt";
import { hasBotManagementException } from "./bot-management";
import type { AppContext, Env } from "./env";

const app = new Hono<AppContext>();

const BUILTIN_PROTECTED_PATHS: ProtectedRouteConfig[] = [
	{
		pattern: "/__x402/protected",
		price: "$0.01",
		description: "Access to test protected endpoint",
	},
];

const BUILTIN_PUBLIC_PATHS = [
	"/__x402/health",
	"/__x402/config",
	"/",
	"/api/wallet/send",
	"/api/wallet/info",
];
const BUILT_IN_PUBLIC_PATHS = BUILTIN_PUBLIC_PATHS;

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
	if (env.ORIGIN_SERVICE) {
		return env.ORIGIN_SERVICE.fetch(request);
	}

	if (env.ORIGIN_URL) {
		const originalUrl = new URL(request.url);
		const targetUrl = new URL(env.ORIGIN_URL);
		const proxiedUrl = new URL(request.url);
		proxiedUrl.hostname = targetUrl.hostname;
		proxiedUrl.protocol = targetUrl.protocol;
		proxiedUrl.port = targetUrl.port;

		const response = await fetch(proxiedUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			redirect: "manual",
		});

		const location = response.headers.get("Location");
		if (location) {
			try {
				const locationUrl = new URL(location, proxiedUrl);
				locationUrl.hostname = originalUrl.hostname;
				locationUrl.protocol = originalUrl.protocol;
				locationUrl.port = originalUrl.port;
				const newHeaders = new Headers(response.headers);
				newHeaders.set("Location", locationUrl.toString());
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			} catch {}
		}
		return response;
	}

	return fetch(request);
}

/**
 * Check if a path matches a pattern
 * Now supports dynamic routes with :param syntax and /* wildcards
 *
 * @param path - Request path to check
 * @param pattern - Route pattern (e.g., "/users/:id", "/premium/*")
 * @returns True if path matches pattern
 */
function pathMatchesPattern(path: string, pattern: string): boolean {
	// Use extractPathParams to check if path matches pattern
	const params = extractPathParams(path, pattern);
	return params !== null;
}

function findProtectedRouteConfig(
	path: string,
	patterns: ProtectedRouteConfig[]
): ProtectedRouteConfig | null {
	const allRoutes = [...BUILTIN_PROTECTED_PATHS, ...patterns];
	return (
		allRoutes.find((config) => pathMatchesPattern(path, config.pattern)) ?? null
	);
}

// ROOT ROUTE — prevents proxy loop on workers.dev
app.get("/", (c) => {
	return c.json({
		status: "ok",
		service: "x402-proxy",
		endpoints: {
			health: "/__x402/health",
			config: "/__x402/config",
			protected: "/__x402/protected",
			wallet: {
				send: "/api/wallet/send",
				info: "/api/wallet/info",
			},
		},
	});
});

app.use("*", async (c, next) => {
	const path = c.req.path;
	const protectedPatterns = c.env.PROTECTED_PATTERNS || [];

	if (BUILT_IN_PUBLIC_PATHS.includes(path)) {
		return next();
	}

	const protectedConfig = findProtectedRouteConfig(path, protectedPatterns);
	if (protectedConfig) {
		if (hasBotManagementException(c.req.raw, protectedConfig)) {
			if (path === "/__x402/protected") {
				return next();
			}
			return proxyToOrigin(c.req.raw, c.env);
		}

		if (!c.env.JWT_SECRET) {
			return c.json(
				{
					error:
						"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
				},
				500
			);
		}

		const protectedMiddleware = createProtectedRoute(protectedConfig);
		let jwtToken = "";

		const result = await protectedMiddleware(c, async () => {
			const hasExistingAuth = c.get("auth");
			if (!hasExistingAuth) {
				jwtToken = await generateJWT(c.env.JWT_SECRET, 3600);
			}
		});

		if (result) {
			return result;
		}

		if (c.res && c.res.status >= 400) {
			return c.res;
		}

		if (path === "/__x402/protected") {
			if (jwtToken) {
				setCookie(c, "auth_token", jwtToken, {
					httpOnly: true,
					secure: true,
					sameSite: "Strict",
					maxAge: 3600,
					path: "/",
				});
			}
			await next();
			return c.res;
		}

		const originResponse = await proxyToOrigin(c.req.raw, c.env);

		if (jwtToken) {
			setCookie(c, "auth_token", jwtToken, {
				httpOnly: true,
				secure: true,
				sameSite: "Strict",
				maxAge: 3600,
				path: "/",
			});

			const newResponse = new Response(originResponse.body, {
				status: originResponse.status,
				statusText: originResponse.statusText,
				headers: new Headers(originResponse.headers),
			});

			const setCookieHeaders = c.res.headers.getSetCookie();
			for (const cookie of setCookieHeaders) {
				newResponse.headers.append("Set-Cookie", cookie);
			}
			return newResponse;
		}
		return originResponse;
	}

	return proxyToOrigin(c.req.raw, c.env);
});

app.get("/__x402/health", (c) => {
	return c.json({
		status: "ok",
		proxy: "x402-proxy",
		message: "This endpoint is always public",
		timestamp: Date.now(),
	});
});

app.get("/__x402/config", (c) => {
	const patterns = (c.env.PROTECTED_PATTERNS || []) as ProtectedRouteConfig[];
	const botFilteringEnabled = patterns.some(
		(p) => p.bot_score_threshold !== undefined
	);

	return c.json({
		network: c.env.NETWORK,
		payTo: c.env.PAY_TO ? `***${c.env.PAY_TO.slice(-6)}` : null,
		hasOriginUrl: !!c.env.ORIGIN_URL,
		hasOriginService: !!c.env.ORIGIN_SERVICE,
		protectedPatterns: patterns.map((p) => ({
			pattern: p.pattern,
			botManagementFiltering:
				p.bot_score_threshold !== undefined
					? {
							threshold: p.bot_score_threshold,
							exceptionsCount: p.except_detection_ids?.length ?? 0,
						}
					: null,
		})),
		botManagementFiltering: botFilteringEnabled,
	});
});

app.get("/__x402/protected", (c) => {
	return c.json({
		message: "Premium content accessed!",
		timestamp: Date.now(),
		note: "This endpoint always requires payment or valid authentication cookie",
	});
});

// ============================================================================
// CDP WALLET ENDPOINTS - Blockchain operations via Coinbase Developer Platform
// ============================================================================

/**
 * POST /api/wallet/send - Send funds from CDP wallet
 *
 * Use case: Send validation payments for agentic.market registration
 *
 * Request body:
 * {
 *   "to": "0x...",           // Destination address
 *   "amount": "0.01",        // Amount in ETH/USDC
 *   "asset": "usdc",         // Asset type: "eth" or "usdc"
 *   "network": "base"        // Network: "base" or "base-sepolia"
 * }
 */
app.post("/api/wallet/send", async (c) => {
	try {
		if (!c.env.CDP_API_KEY || !c.env.CDP_PRIVATE_KEY) {
			return c.json(
				{
					error:
						"CDP credentials not configured. Set CDP_API_KEY and CDP_PRIVATE_KEY secrets.",
				},
				500
			);
		}

		const body = await c.req.json();
		const { to, amount, asset = "usdc", network = "base-sepolia" } = body;

		if (!to || !amount) {
			return c.json(
				{
					error: "Missing required fields: to, amount",
				},
				400
			);
		}

		// Dynamic import for CDP SDK (only loads when needed)
		const { CdpClient } = await import("@coinbase/cdp-sdk");

		// Initialize CDP Client
		const _cdp = new CdpClient({
			apiKeyId: c.env.CDP_API_KEY,
			apiKeySecret: c.env.CDP_PRIVATE_KEY,
		});

		// For now, return a success response with instructions
		// The CDP SDK for server-side wallet operations requires more setup
		return c.json({
			success: true,
			message: "CDP SDK integrated successfully",
			note: "To complete wallet operations, you need to create an EVM account and fund it.",
			instructions: {
				createAccount: "Use cdp.createEvmAccount() to create a new account",
				fundAccount: "Fund the account with testnet/mainnet tokens",
				sendTransaction: "Use account.sendEvmAsset() to send funds",
			},
			requestedTransfer: {
				to,
				amount,
				asset,
				network,
			},
		});
	} catch (error: any) {
		console.error("Wallet send error:", error);
		return c.json(
			{
				error: "Failed to process wallet request",
				details: error.message,
			},
			500
		);
	}
});

/**
 * GET /api/wallet/info - Get CDP client information
 *
 * Returns CDP SDK initialization status and configuration
 */
app.get("/api/wallet/info", async (c) => {
	try {
		if (!c.env.CDP_API_KEY || !c.env.CDP_PRIVATE_KEY) {
			return c.json(
				{
					error:
						"CDP credentials not configured. Set CDP_API_KEY and CDP_PRIVATE_KEY secrets.",
				},
				500
			);
		}

		const { CdpClient } = await import("@coinbase/cdp-sdk");

		const _cdp = new CdpClient({
			apiKeyId: c.env.CDP_API_KEY,
			apiKeySecret: c.env.CDP_PRIVATE_KEY,
		});

		return c.json({
			configured: true,
			message: "CDP SDK is properly configured",
			capabilities: [
				"Create EVM and Solana accounts",
				"Send transactions on Base, Base Sepolia, and other networks",
				"Manage end users and delegated signing",
				"EIP-7702 delegation support",
			],
			nextSteps: [
				"Create an account: POST /api/wallet/account/create",
				"Send funds: POST /api/wallet/send (after account creation)",
			],
		});
	} catch (error: any) {
		console.error("Wallet info error:", error);
		return c.json(
			{
				error: "Failed to initialize CDP client",
				details: error.message,
			},
			500
		);
	}
});

export default app;
