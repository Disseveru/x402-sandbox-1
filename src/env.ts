/**
 * Environment bindings type definition
 */

import type { JWTPayload } from "./jwt";

export interface Env extends CloudflareBindings {
	/** Secret API key for XAI chat/completions */
	XAI_API_KEY: string;
	/** Optional JWT secret used only when clients send auth_token cookies to shared payment middleware */
	JWT_SECRET?: string;
}

/** Full app context type for Hono */
export interface AppContext {
	Bindings: Env;
	Variables: {
		auth?: JWTPayload;
	};
}
