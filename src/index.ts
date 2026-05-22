import { Hono } from "hono";
import { createProtectedRoute, type ProtectedRouteConfig } from "./auth";
import type { AppContext, Env } from "./env";

const app = new Hono<AppContext>();

const COMPANY_ANGLE_PATH = "/v1/company-angle";

const DEFAULT_COMPANY_ANGLE_PROTECTION: ProtectedRouteConfig = {
	pattern: COMPANY_ANGLE_PATH,
	price: "$0.01",
	description: "Generate one actionable company outreach angle",
};

interface CompanyAngleRequest {
	company_name?: string;
	domain?: string;
	context?: string[];
	notes?: string;
}

interface ValidationResult {
	value?: CompanyAngleRequest;
	error?: string;
}

function normalizeRoutePath(path: string): string {
	if (path === "/") {
		return path;
	}

	return path.replace(/\/+$/, "") || "/";
}

function pathMatchesPattern(path: string, pattern: string): boolean {
	const normalizedPath = normalizeRoutePath(path);

	if (pattern.endsWith("/*")) {
		const base = normalizeRoutePath(pattern.slice(0, -2));
		return normalizedPath === base || normalizedPath.startsWith(`${base}/`);
	}

	return normalizedPath === normalizeRoutePath(pattern);
}

function getCompanyAngleProtection(
	patterns: ProtectedRouteConfig[]
): ProtectedRouteConfig {
	return (
		patterns.find((config) =>
			pathMatchesPattern(COMPANY_ANGLE_PATH, config.pattern)
		) ?? DEFAULT_COMPANY_ANGLE_PROTECTION
	);
}

export function validateCompanyAngleRequest(input: unknown): ValidationResult {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {
			error:
				"Request body must be an object with company_name, domain, context, or notes.",
		};
	}

	const data = input as Record<string, unknown>;
	const value: CompanyAngleRequest = {};

	if (data.company_name !== undefined) {
		if (typeof data.company_name !== "string") {
			return { error: "company_name must be a string." };
		}
		const companyName = data.company_name.trim();
		if (companyName.length === 0 || companyName.length > 120) {
			return { error: "company_name must be between 1 and 120 characters." };
		}
		value.company_name = companyName;
	}

	if (data.domain !== undefined) {
		if (typeof data.domain !== "string") {
			return { error: "domain must be a string." };
		}
		const domain = data.domain.trim().toLowerCase();
		if (
			domain.length === 0 ||
			domain.length > 253 ||
			!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)
		) {
			return { error: "domain must be a valid hostname like example.com." };
		}
		value.domain = domain;
	}

	if (data.context !== undefined) {
		if (!Array.isArray(data.context)) {
			return { error: "context must be an array of strings." };
		}
		if (data.context.length > 20) {
			return { error: "context can include up to 20 items." };
		}

		const contextItems: string[] = [];
		for (const entry of data.context) {
			if (typeof entry !== "string") {
				return { error: "Each context entry must be a string." };
			}
			const trimmed = entry.trim();
			if (trimmed.length === 0 || trimmed.length > 300) {
				return {
					error: "Each context entry must be between 1 and 300 characters.",
				};
			}
			contextItems.push(trimmed);
		}

		if (contextItems.length > 0) {
			value.context = contextItems;
		}
	}

	if (data.notes !== undefined) {
		if (typeof data.notes !== "string") {
			return { error: "notes must be a string." };
		}
		const notes = data.notes.trim();
		if (notes.length === 0 || notes.length > 2000) {
			return { error: "notes must be between 1 and 2000 characters." };
		}
		value.notes = notes;
	}

	if (!value.company_name && !value.domain && !value.context && !value.notes) {
		return {
			error:
				"Provide at least one of: company_name, domain, context, or notes.",
		};
	}

	return { value };
}

function buildCompanyAnglePrompt(input: CompanyAngleRequest): string {
	const contextLines =
		input.context?.map((line) => `- ${line}`).join("\n") || "- None provided";

	return [
		"Create the best outreach or action angle for autonomous agent usage.",
		"Return exactly one actionable sentence and nothing else.",
		`Company name: ${input.company_name ?? "Unknown"}`,
		`Domain: ${input.domain ?? "Unknown"}`,
		"Context:",
		contextLines,
		`Notes: ${input.notes ?? "None"}`,
	].join("\n");
}

export function enforceSingleSentence(rawText: string): string {
	const normalized = rawText.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return "No clear action angle is available from the provided input.";
	}

	const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
	const cleaned = firstSentence.replace(/^[-*\s]+/, "").trim();

	if (!cleaned) {
		return "No clear action angle is available from the provided input.";
	}

	if (/[.!?]$/.test(cleaned)) {
		return cleaned;
	}

	return `${cleaned}.`;
}

async function requestCompanyAngleFromXai(
	env: Env,
	input: CompanyAngleRequest
): Promise<string> {
	if (!env.XAI_API_KEY) {
		throw new Error("Server misconfigured: XAI_API_KEY is not set.");
	}

	const response = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.XAI_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: env.XAI_MODEL || "grok-3-mini",
			temperature: 0.2,
			max_tokens: 120,
			messages: [
				{
					role: "system",
					content:
						"You are an API that outputs one actionable sentence for sales or strategic outreach based on company context.",
				},
				{
					role: "user",
					content: buildCompanyAnglePrompt(input),
				},
			],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`XAI request failed with status ${response.status}: ${errorText.slice(0, 200)}`
		);
	}

	const data = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const rawText = data.choices?.[0]?.message?.content;

	if (!rawText || typeof rawText !== "string") {
		throw new Error("XAI returned an invalid response payload.");
	}

	return enforceSingleSentence(rawText);
}

app.get("/__x402/health", (c) => {
	return c.json({
		status: "ok",
		product: "company-angle-api",
		endpoint: COMPANY_ANGLE_PATH,
		timestamp: Date.now(),
	});
});

app.get("/__x402/config", (c) => {
	const patterns = (c.env.PROTECTED_PATTERNS || []) as ProtectedRouteConfig[];
	const companyAngleProtection = getCompanyAngleProtection(patterns);

	return c.json({
		network: c.env.NETWORK,
		payTo: c.env.PAY_TO ? `***${c.env.PAY_TO.slice(-6)}` : null,
		xaiConfigured: Boolean(c.env.XAI_API_KEY),
		companyAngleProtection: {
			pattern: companyAngleProtection.pattern,
			price: companyAngleProtection.price,
			description: companyAngleProtection.description,
		},
		protectedPatterns: patterns,
	});
});

app.post(
	COMPANY_ANGLE_PATH,
	async (c, next) => {
		const patterns = (c.env.PROTECTED_PATTERNS || []) as ProtectedRouteConfig[];
		const routeConfig = getCompanyAngleProtection(patterns);
		return createProtectedRoute(routeConfig)(c, next);
	},
	async (c) => {
		let payload: unknown;
		try {
			payload = await c.req.json();
		} catch {
			return c.json(
				{ error: "invalid_json", message: "Request body must be valid JSON." },
				400
			);
		}

		const validation = validateCompanyAngleRequest(payload);
		if (validation.error || !validation.value) {
			return c.json(
				{ error: "invalid_request", message: validation.error },
				400
			);
		}

		try {
			const summary = await requestCompanyAngleFromXai(c.env, validation.value);
			return c.json({ summary });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to generate company angle.";
			const status = message.includes("XAI_API_KEY") ? 500 : 502;

			return c.json({ error: "upstream_error", message }, status);
		}
	}
);

app.notFound((c) => {
	return c.json(
		{
			error: "not_found",
			message: "Route not found.",
			available_routes: [
				"GET /__x402/health",
				"GET /__x402/config",
				"POST /v1/company-angle",
			],
		},
		404
	);
});

export default app;
