/**
 * Environment bindings type definition
 */

import type { JWTPayload } from "./jwt";

export interface Env extends CloudflareBindings {
	/** Secret API key for XAI chat/completions */
	XAI_API_KEY: string;
	/** Optional JWT secret for cookie-based auth support in shared x402 middleware */
	JWT_SECRET?: string;
}

/** Full app context type for Hono */
export interface AppContext {
	Bindings: Env;
	Variables: {
		auth?: JWTPayload;
	};
}
