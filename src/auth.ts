/**
 * Authentication middleware for cookie-based JWT verification
 */

import { Context, Next, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJWT } from "./jwt";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { AppContext } from "./env";

/**
 * Creates a combined middleware that checks for valid cookie authentication
 * and conditionally applies payment middleware only if cookie auth fails
 *
 * @param paymentMiddleware - The payment middleware to apply when no valid cookie exists
 * @returns Combined authentication and payment middleware
 */
export function requirePaymentOrCookie(paymentMw: MiddlewareHandler) {
	return async (c: Context<AppContext>, next: Next) => {
		// Check for valid cookie
		const token = getCookie(c, "auth_token");

		if (token) {
			const jwtSecret = c.env.JWT_SECRET;

			// Ensure JWT_SECRET is configured
			if (!jwtSecret) {
				return c.json(
					{
						error:
							"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
					},
					500
				);
			}

			const payload = await verifyJWT(token, jwtSecret);

			// If token is valid, skip payment and go directly to handler
			if (payload) {
				c.set("auth", payload);
				await next(); // Call the handler
				return;
			}
		}

		// No valid cookie - apply payment middleware
		return await paymentMw(c, next);
	};
}

/**
 * Configuration for a protected route that requires payment
 */
export interface ProtectedRouteConfig {
	/** Route pattern to protect (e.g., "/premium", "/api/paid/*") */
	pattern: string;
	/** Price in USD (e.g. "$0.01") */
	price: string;
	/** Human-readable description of what the payment is for */
	description: string;
	/**
	 * Bot Management Filtering (optional)
	 * Requires Bot Management for Enterprise. See src/bot-management/ for details.
	 */
	bot_score_threshold?: number;
	except_detection_ids?: number[];
}

/**
 * Creates middleware for a protected route that requires payment OR valid cookie
 * This dynamically creates payment middleware at request time to access environment variables
 * The route path is automatically determined from the request context
 *
 * @param config - Payment configuration
 * @returns Middleware that enforces payment or cookie authentication
 */
export function createProtectedRoute(config: ProtectedRouteConfig) {
	return async (c: Context<AppContext>, next: Next) => {
		// Get the route path from the request context
		// Normalize the path by removing trailing slashes (except for root "/")
		const rawPath = c.req.path;
		const routePath =
			rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

		// Get the HTTP method
		const method = c.req.method;

		// Convert network string to CAIP-2 format if needed
		// base -> eip155:8453, base-sepolia -> eip155:84532
		const networkMap: Record<string, `${string}:${string}`> = {
			"base": "eip155:8453",
			"base-sepolia": "eip155:84532",
		};
		const network = (networkMap[c.env.NETWORK] || c.env.NETWORK) as `${string}:${string}`;

		// Create facilitator client
		const facilitatorUrl = c.env.FACILITATOR_URL || "https://facilitator.x402.org";
		const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

		// Create resource server with EVM scheme
		const resourceServer = new x402ResourceServer(facilitatorClient)
			.register(network, new ExactEvmScheme());

		// Create route configuration for x402 v2
		const routeKey = `${method} ${routePath}`;
		const routes = {
			[routeKey]: {
				accepts: {
					scheme: "exact" as const,
					price: config.price,
					network: network,
					payTo: c.env.PAY_TO as `0x${string}`,
					maxTimeoutSeconds: 300,
				},
				description: config.description,
			},
		};

		// Create payment middleware
		// Disable facilitator sync on startup to avoid initialization errors
		const paymentMw = paymentMiddleware(routes, resourceServer, undefined, undefined, false);

		// Apply the combined auth/payment middleware
		return await requirePaymentOrCookie(paymentMw)(c, next);
	};
}
