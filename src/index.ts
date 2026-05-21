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
	// Check built-in protected routes first, then configured patterns
	const allRoutes = [...BUILTIN_PROTECTED_PATHS, ...patterns];
	return (
		allRoutes.find((config) => pathMatchesPattern(path, config.pattern)) ?? null
	);
}

/**
 * Main proxy handler - intercepts protected routes, proxies everything else
 * Note: This middleware runs for all routes, but route handlers below can still
 * take precedence by being registered after this middleware
 */
app.use("*", async (c, next) => {
	const path = c.req.path;
	const protectedPatterns = c.env.PROTECTED_PATTERNS || [];

	// Special handling for built-in endpoints
	// These are handled by route handlers below, not proxied
	if (BUILT_IN_PUBLIC_PATHS.includes(path)) {
		return next(); // Let the route handler below handle it
	}

	// Check if this path is protected (including /__x402/protected)
	const protectedConfig = findProtectedRouteConfig(path, protectedPatterns);
	if (protectedConfig) {
		// Bot Management Filtering: check if request has exception (human or excepted bot)
		if (hasBotManagementException(c.req.raw, protectedConfig)) {
			if (path === "/__x402/protected") {
				return next();
			}
			return proxyToOrigin(c.req.raw, c.env);
		}

		// Ensure JWT_SECRET is configured before processing protected routes
		if (!c.env.JWT_SECRET) {
			return c.json(
				{
					error:
						"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
				},
				500
			);
		}

		// Use the protected route middleware
		const protectedMiddleware = createProtectedRoute(protectedConfig);
		let jwtToken = "";

		const result = await protectedMiddleware(c, async () => {
			// After successful auth, check if we need to issue a cookie
			const hasExistingAuth = c.get("auth");

			if (!hasExistingAuth) {
				// This is a new payment - generate JWT cookie
				// Note: This runs after payment verification but BEFORE settlement.
				// We'll check if settlement succeeded before actually using the token.
				jwtToken = await generateJWT(c.env.JWT_SECRET, 3600);
			}

			// Do nothing here - we'll proxy after middleware returns
		});

		// If middleware returned a response (e.g., 402), return it
		if (result) {
			return result;
		}

		// Check if the payment middleware set an error response (e.g., settlement failed)
		// The x402-hono middleware sets c.res to a 402 if settlement fails, even though
		// it doesn't return a Response object. We must check c.res status and discard
		// the JWT token if payment didn't fully complete.
		if (c.res && c.res.status >= 400) {
			// Payment verification succeeded but settlement failed - don't grant access
			return c.res;
		}

		if (path === "/__x402/protected") {
			// If we generated a JWT token, set the cookie BEFORE calling next()
			// so it's included in the response that Hono builds
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

		// Proxy the authenticated request to origin
		const originResponse = await proxyToOrigin(c.req.raw, c.env);

		// If we generated a JWT token, add it as a cookie to the response
		if (jwtToken) {
			// Use Hono's setCookie to generate the proper Set-Cookie header
			setCookie(c, "auth_token", jwtToken, {
				httpOnly: true,
				secure: true,
				sameSite: "Strict",
				maxAge: 3600,
				path: "/",
			});

			// Clone the origin response and add our cookie header
			const newResponse = new Response(originResponse.body, {
				status: originResponse.status,
				statusText: originResponse.statusText,
				headers: new Headers(originResponse.headers),
			});

			// Copy Set-Cookie headers from Hono context to our response
			// Use getSetCookie() to properly handle multiple Set-Cookie headers
			const setCookieHeaders = c.res.headers.getSetCookie();
			for (const cookie of setCookieHeaders) {
				newResponse.headers.append("Set-Cookie", cookie);
			}

			return newResponse;
		}

		// Otherwise, return origin response as-is
		return originResponse;
	}

	// Proxy unprotected routes directly to origin
	return proxyToOrigin(c.req.raw, c.env);
});

/**
 * Built-in test endpoint - always public, never requires payment
 * Used for health checks and testing proxy functionality
 */
app.get("/__x402/health", (c) => {
	return c.json({
		status: "ok",
		proxy: "x402-proxy",
		message: "This endpoint is always public",
		timestamp: Date.now(),
	});
});

/**
 * Config status endpoint - shows current configuration (no secrets exposed)
 * Useful for debugging and verifying deployment
 */
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

/**
 * Built-in test endpoint - always protected, always requires payment
 * Used for testing payment flow without needing to configure protected patterns
 * This endpoint serves content directly (not proxied to origin)
 */
app.get("/__x402/protected", (c) => {
	return c.json({
		message: "Premium content accessed!",
		timestamp: Date.now(),
		note: "This endpoint always requires payment or valid authentication cookie",
	});
});

export default app;
