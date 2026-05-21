import type { Context } from "hono";
import type { AppContext } from "./env";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 500_000;
const MAX_EXTRA_PAGES = 3;
const MAX_LINKS_PER_CATEGORY = 5;
const MAX_HEADINGS = 12;
const MAX_PARAGRAPHS = 8;
const MAX_CTAS = 10;
const MAX_FAQS = 6;
const MAX_FAQ_TEXT_LENGTH = 220;
const MIN_PARAGRAPH_LENGTH = 60;
const MAX_TEXT_SNIPPET_LENGTH = 2_000;

const CTA_KEYWORDS = [
	"get started",
	"book demo",
	"request demo",
	"start free",
	"sign up",
	"contact sales",
	"buy now",
	"learn more",
	"try",
	"download",
];

const SOCIAL_HOSTS = [
	"linkedin.com",
	"twitter.com",
	"x.com",
	"facebook.com",
	"instagram.com",
	"youtube.com",
	"github.com",
	"tiktok.com",
];

const LOCAL_API_PATHS = ["/api/enrich", "/api/compliance", "/api/extract"];

interface ParsedInput {
	targetUrl: URL;
	normalizedUrl: string;
	domain: string;
}

interface FetchedHtml {
	finalUrl: string;
	html: string;
	contentType: string;
}

interface ParsedLink {
	href: string;
	text: string;
	isSameOrigin: boolean;
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
	return normalizeText(
		value
			.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ")
			.replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ")
			.replace(/<[^>]+>/g, " ")
	);
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&#x2F;/gi, "/");
}

function getMatch(html: string, regex: RegExp): string {
	const match = html.match(regex);
	if (!match || !match[1]) {
		return "";
	}
	return normalizeText(decodeHtmlEntities(stripTags(match[1])));
}

function findTitle(html: string): string {
	return getMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
}

function findMetaDescription(html: string): string {
	const direct = html.match(
		/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
	);
	if (direct?.[1]) {
		return normalizeText(decodeHtmlEntities(direct[1]));
	}

	const reverseOrder = html.match(
		/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
	);
	return normalizeText(decodeHtmlEntities(reverseOrder?.[1] ?? ""));
}

function normalizeInputTarget(input: string): URL {
	const trimmed = input.trim();
	const withProtocol = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	const parsed = new URL(withProtocol);
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Unsupported URL protocol");
	}
	return parsed;
}

async function resolveTargetInput(
	c: Context<AppContext>
): Promise<ParsedInput | Response> {
	const queryUrl =
		c.req.query("url") || c.req.query("domain") || c.req.query("target");
	let bodyUrl = "";

	if (c.req.method !== "GET") {
		const contentType = c.req.header("content-type") || "";
		if (contentType.includes("application/json")) {
			try {
				const body = (await c.req.json()) as Record<string, unknown>;
				const candidate = body.url ?? body.domain ?? body.target;
				if (typeof candidate === "string") {
					bodyUrl = candidate;
				}
			} catch {
				return c.json({ error: "Invalid JSON body" }, 400);
			}
		}
	}

	const rawInput = queryUrl || bodyUrl;
	if (!rawInput) {
		return c.json(
			{
				error:
					'Missing target website. Provide url/domain via query (?url=) or JSON body ({"url":"..."}).',
			},
			400
		);
	}

	let targetUrl: URL;
	try {
		targetUrl = normalizeInputTarget(rawInput);
	} catch {
		return c.json({ error: "Invalid target website URL or domain" }, 400);
	}

	const normalizedUrl = `${targetUrl.origin}${targetUrl.pathname}${targetUrl.search}`;
	return {
		targetUrl,
		normalizedUrl,
		domain: targetUrl.hostname,
	};
}

async function fetchWithTimeout(
	url: URL,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url.toString(), {
			method: "GET",
			headers: {
				Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
			},
			redirect: "follow",
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function readBodyWithLimit(
	response: Response,
	maxBytes: number
): Promise<string> {
	const contentLengthHeader = response.headers.get("content-length");
	if (contentLengthHeader) {
		const contentLength = Number(contentLengthHeader);
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			throw new Error("response_too_large");
		}
	}

	if (!response.body) {
		return "";
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let totalBytes = 0;
	let text = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			await reader.cancel();
			throw new Error("response_too_large");
		}

		text += decoder.decode(value, { stream: true });
	}

	text += decoder.decode();
	return text;
}

async function fetchHtmlPage(url: URL): Promise<FetchedHtml> {
	let response: Response;
	try {
		response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "request_error";
		throw new Error(`fetch_failed:${reason}`);
	}

	if (!response.ok) {
		throw new Error(`fetch_failed_status_${response.status}`);
	}

	const contentType = response.headers.get("content-type") || "";
	const normalizedContentType = contentType.toLowerCase();
	if (
		!normalizedContentType.includes("text/html") &&
		!normalizedContentType.includes("application/xhtml+xml")
	) {
		throw new Error("unsupported_content_type");
	}

	const html = await readBodyWithLimit(response, MAX_HTML_BYTES);
	return {
		finalUrl: response.url || url.toString(),
		html,
		contentType,
	};
}

function parseAnchors(html: string, baseUrl: URL): ParsedLink[] {
	const links: ParsedLink[] = [];
	const anchorRegex =
		/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

	for (const match of html.matchAll(anchorRegex)) {
		const rawHref = match[2]?.trim();
		if (!rawHref) {
			continue;
		}

		try {
			const absolute = new URL(rawHref, baseUrl);
			if (!["http:", "https:"].includes(absolute.protocol)) {
				continue;
			}
			const text = normalizeText(decodeHtmlEntities(stripTags(match[3] || "")));
			links.push({
				href: absolute.toString(),
				text,
				isSameOrigin: absolute.origin === baseUrl.origin,
			});
		} catch {
			continue;
		}
	}

	return links;
}

function uniqueValues(
	values: string[],
	maxItems = MAX_LINKS_PER_CATEGORY
): string[] {
	const unique = [
		...new Set(values.map((value) => value.trim()).filter(Boolean)),
	];
	return unique.slice(0, maxItems);
}

function pickSameOriginLinks(links: ParsedLink[], matcher: RegExp): string[] {
	return uniqueValues(
		links
			.filter((link) => link.isSameOrigin)
			.filter((link) => matcher.test(link.href) || matcher.test(link.text))
			.map((link) => link.href)
	);
}

function pickSocialLinks(links: ParsedLink[]): string[] {
	return uniqueValues(
		links
			.filter((link) =>
				SOCIAL_HOSTS.some((host) => new URL(link.href).hostname.includes(host))
			)
			.map((link) => link.href)
	);
}

function inferCategoryHints(text: string, links: ParsedLink[]): string[] {
	const normalized = text.toLowerCase();
	const hasBlogLinks = links.some((link) =>
		/\/blog|\/news/.test(link.href.toLowerCase())
	);
	const hints = new Set<string>();

	if (
		/(pricing|plans|free trial|enterprise|integrations|api|platform)/.test(
			normalized
		)
	) {
		hints.add("saas");
	}

	if (
		/(agency|studio|our clients|case studies|creative services)/.test(
			normalized
		)
	) {
		hints.add("agency");
	}

	if (
		/(add to cart|shop now|checkout|sku|free shipping|product catalog)/.test(
			normalized
		)
	) {
		hints.add("ecommerce");
	}

	if (
		/(visit us|opening hours|book appointment|call now|nearby|our location)/.test(
			normalized
		)
	) {
		hints.add("local-business");
	}

	if (
		/(newsroom|latest posts|editorial|opinion|subscribe)/.test(normalized) ||
		hasBlogLinks
	) {
		hints.add("blog/media");
	}

	if (hints.size === 0) {
		hints.add("unknown");
	}

	return [...hints];
}

function extractHeadings(html: string): string[] {
	const headings: string[] = [];
	for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
		headings.push(normalizeText(decodeHtmlEntities(stripTags(match[1] || ""))));
	}
	return uniqueValues(headings, MAX_HEADINGS);
}

function extractParagraphs(html: string): string[] {
	const paragraphs: string[] = [];
	for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
		const cleaned = normalizeText(
			decodeHtmlEntities(stripTags(match[1] || ""))
		);
		if (cleaned.length >= MIN_PARAGRAPH_LENGTH) {
			paragraphs.push(cleaned);
		}
	}
	return uniqueValues(paragraphs, MAX_PARAGRAPHS);
}

function extractCtas(
	links: ParsedLink[]
): Array<{ text: string; href: string }> {
	const ctas = links
		.filter((link) => {
			const text = link.text.toLowerCase();
			return CTA_KEYWORDS.some((keyword) => text.includes(keyword));
		})
		.map((link) => ({ text: link.text, href: link.href }));

	const unique = new Map<string, { text: string; href: string }>();
	for (const cta of ctas) {
		const key = `${cta.text}|${cta.href}`;
		if (!unique.has(key)) {
			unique.set(key, cta);
		}
	}

	return [...unique.values()].slice(0, MAX_CTAS);
}

function extractFaqBlocks(html: string): string[] {
	const faqMatches: string[] = [];

	for (const match of html.matchAll(
		/<(summary|h[1-4]|dt)[^>]*>([\s\S]*?)<\/(summary|h[1-4]|dt)>/gi
	)) {
		const candidate = normalizeText(
			decodeHtmlEntities(stripTags(match[2] || ""))
		);
		if (candidate.includes("?") && candidate.length <= MAX_FAQ_TEXT_LENGTH) {
			faqMatches.push(candidate);
		}
	}

	return uniqueValues(faqMatches, MAX_FAQS);
}

function detectComplianceSignals(text: string, links: ParsedLink[]) {
	const normalizedText = text.toLowerCase();
	const sameOriginLinkSignals = links
		.filter((link) => link.isSameOrigin)
		.map((link) => `${link.text} ${link.href}`.toLowerCase());
	const hasInLinks = (pattern: RegExp) =>
		sameOriginLinkSignals.some((entry) => pattern.test(entry));

	const hasPrivacy = /privacy/.test(normalizedText) || hasInLinks(/privacy/);
	const hasTerms =
		/terms|conditions|tos/.test(normalizedText) ||
		hasInLinks(/terms|conditions|tos/);
	const hasRefund =
		/refund|returns?/.test(normalizedText) || hasInLinks(/refund|returns?/);
	const hasCookie = /cookie|consent/.test(normalizedText);
	const hasPricing =
		/pricing|plans|subscription|\$\d+/.test(normalizedText) ||
		hasInLinks(/pricing|plans/);
	const hasContact =
		hasInLinks(/contact/) ||
		/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
		/\+?[0-9][0-9\s().-]{7,}/.test(text);

	return {
		privacyPolicyFound: hasPrivacy,
		termsFound: hasTerms,
		refundOrReturnsFound: hasRefund,
		contactInfoFound: hasContact,
		pricingFound: hasPricing,
		cookieWordingPresent: hasCookie,
	};
}

function summarizeCompliance(
	signals: ReturnType<typeof detectComplianceSignals>
) {
	const missingCore = [
		signals.privacyPolicyFound ? null : "privacy_policy_not_detected",
		signals.termsFound ? null : "terms_not_detected",
		signals.contactInfoFound ? null : "contact_info_not_detected",
	].filter((flag): flag is string => Boolean(flag));

	const cautionFlags = [
		signals.pricingFound ? null : "pricing_not_detected",
		signals.cookieWordingPresent ? null : "cookie_wording_not_detected",
	].filter((flag): flag is string => Boolean(flag));

	const summary =
		missingCore.length === 0
			? "Core trust/compliance signals were detected on sampled pages. Results are heuristic and informational only."
			: "Some common trust/compliance signals were not detected on sampled pages. Results are heuristic and informational only.";

	return {
		summary,
		riskFlags: [...missingCore, ...cautionFlags],
	};
}

function getLocalApiPath(path: string): string {
	return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

export function isBuiltInApiPath(path: string): boolean {
	return LOCAL_API_PATHS.includes(getLocalApiPath(path));
}

function mapFetchErrorToResponse(
	c: Context<AppContext>,
	error: unknown
): Response {
	const message = error instanceof Error ? error.message : "unknown_error";

	if (message === "unsupported_content_type") {
		return c.json({ error: "Target URL did not return HTML content" }, 415);
	}

	if (message === "response_too_large") {
		return c.json({ error: "Target page is too large to process safely" }, 413);
	}

	if (message.startsWith("fetch_failed_status_")) {
		return c.json(
			{
				error: "Target URL fetch failed",
				detail: message.replace("fetch_failed_status_", "status_"),
			},
			502
		);
	}
	if (message.startsWith("fetch_failed:")) {
		return c.json(
			{
				error: "Target URL fetch failed",
				detail: message.replace("fetch_failed:", ""),
			},
			502
		);
	}

	return c.json({ error: "Target URL fetch failed" }, 502);
}

async function loadTargetPage(c: Context<AppContext>): Promise<
	| {
			input: ParsedInput;
			baseUrl: URL;
			html: string;
			contentType: string;
	  }
	| Response
> {
	const input = await resolveTargetInput(c);
	if (input instanceof Response) {
		return input;
	}

	try {
		const page = await fetchHtmlPage(input.targetUrl);
		const baseUrl = new URL(page.finalUrl);
		return {
			input: {
				...input,
				normalizedUrl: page.finalUrl,
				domain: baseUrl.hostname,
			},
			baseUrl,
			html: page.html,
			contentType: page.contentType,
		};
	} catch (error) {
		return mapFetchErrorToResponse(c, error);
	}
}

export async function handleEnrich(c: Context<AppContext>): Promise<Response> {
	const loaded = await loadTargetPage(c);
	if (loaded instanceof Response) {
		return loaded;
	}

	const title = findTitle(loaded.html);
	const description = findMetaDescription(loaded.html);
	const links = parseAnchors(loaded.html, loaded.baseUrl);
	const text = stripTags(loaded.html).toLowerCase();

	return c.json({
		api: "enrich",
		normalizedUrl: loaded.input.normalizedUrl,
		domain: loaded.input.domain,
		title,
		description,
		contentType: loaded.contentType,
		links: {
			contact: pickSameOriginLinks(links, /(\/|\b)(contact|support)(\/|\b)/i),
			about: pickSameOriginLinks(
				links,
				/(\/|\b)(about|company|team|story)(\/|\b)/i
			),
			pricing: pickSameOriginLinks(
				links,
				/(\/|\b)(pricing|plans|billing)(\/|\b)/i
			),
			blog: pickSameOriginLinks(links, /(\/|\b)(blog|news|articles)(\/|\b)/i),
			careers: pickSameOriginLinks(
				links,
				/(\/|\b)(careers?|jobs?|hiring)(\/|\b)/i
			),
			social: pickSocialLinks(links),
		},
		categoryHints: inferCategoryHints(text, links),
		notes: [
			"Heuristic output for lightweight lead enrichment. Not a comprehensive crawler.",
		],
	});
}

export async function handleCompliance(
	c: Context<AppContext>
): Promise<Response> {
	const loaded = await loadTargetPage(c);
	if (loaded instanceof Response) {
		return loaded;
	}

	const links = parseAnchors(loaded.html, loaded.baseUrl);
	const sampledTextParts = [stripTags(loaded.html)];

	const candidateLinks = links
		.filter((link) => link.isSameOrigin)
		.filter((link) =>
			/(privacy|terms|conditions|refund|returns|contact|pricing|cookies?)/i.test(
				`${link.text} ${link.href}`
			)
		)
		.map((link) => link.href);

	for (const href of uniqueValues(candidateLinks, MAX_EXTRA_PAGES)) {
		try {
			const extraPage = await fetchHtmlPage(new URL(href));
			sampledTextParts.push(stripTags(extraPage.html));
		} catch {
			continue;
		}
	}

	const sampledText = sampledTextParts.join(" ");
	const signals = detectComplianceSignals(sampledText, links);
	const summary = summarizeCompliance(signals);

	return c.json({
		api: "compliance",
		normalizedUrl: loaded.input.normalizedUrl,
		domain: loaded.input.domain,
		signals,
		summary,
		disclaimer:
			"Informational heuristic detection only. This output is not legal advice and does not determine legal compliance.",
	});
}

export async function handleExtract(c: Context<AppContext>): Promise<Response> {
	const loaded = await loadTargetPage(c);
	if (loaded instanceof Response) {
		return loaded;
	}

	const title = findTitle(loaded.html);
	const description = findMetaDescription(loaded.html);
	const links = parseAnchors(loaded.html, loaded.baseUrl);
	const headings = extractHeadings(loaded.html);
	const paragraphs = extractParagraphs(loaded.html);
	const ctas = extractCtas(links);
	const faqLike = extractFaqBlocks(loaded.html);
	const cleanedSnippet = stripTags(loaded.html).slice(
		0,
		MAX_TEXT_SNIPPET_LENGTH
	);

	return c.json({
		api: "extract",
		normalizedUrl: loaded.input.normalizedUrl,
		domain: loaded.input.domain,
		title,
		description,
		headings,
		keyParagraphs: paragraphs,
		textSnippet: cleanedSnippet,
		callsToAction: ctas,
		faqLike,
		notes: [
			"Output is optimized for lightweight downstream LLM prompting and retrieval.",
		],
	});
}
