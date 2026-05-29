/**
 * Tests for x402 v2 dynamic routes with parameter extraction
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { extractPathParams, patternToRouteTemplate } from "../src/auth";

describe("Dynamic Routes - x402 v2", () => {
	describe("patternToRouteTemplate", () => {
		it("should preserve :param syntax", () => {
			assert.strictEqual(patternToRouteTemplate("/users/:id"), "/users/:id");
			assert.strictEqual(
				patternToRouteTemplate("/weather/:city"),
				"/weather/:city"
			);
			assert.strictEqual(
				patternToRouteTemplate("/weather/:country/:city"),
				"/weather/:country/:city"
			);
		});

		it("should convert wildcard /* to :var1", () => {
			assert.strictEqual(
				patternToRouteTemplate("/premium/*"),
				"/premium/:var1"
			);
			assert.strictEqual(patternToRouteTemplate("/api/*"), "/api/:var1");
		});

		it("should preserve static routes", () => {
			assert.strictEqual(
				patternToRouteTemplate("/api/simulate"),
				"/api/simulate"
			);
			assert.strictEqual(patternToRouteTemplate("/health"), "/health");
		});
	});

	describe("extractPathParams", () => {
		it("should extract single path parameter", () => {
			const params = extractPathParams("/users/123", "/users/:id");
			assert.deepStrictEqual(params, { id: "123" });
		});

		it("should extract multiple path parameters", () => {
			const params = extractPathParams(
				"/weather/us/san-francisco",
				"/weather/:country/:city"
			);
			assert.deepStrictEqual(params, { country: "us", city: "san-francisco" });
		});

		it("should extract parameters from wildcard routes", () => {
			const params = extractPathParams(
				"/premium/content/video.mp4",
				"/premium/*"
			);
			assert.deepStrictEqual(params, { var1: "content/video.mp4" });
		});

		it("should return empty object for exact match with no params", () => {
			const params = extractPathParams("/api/simulate", "/api/simulate");
			assert.deepStrictEqual(params, {});
		});

		it("should return null when path doesn't match pattern", () => {
			const params = extractPathParams("/posts/123", "/users/:id");
			assert.strictEqual(params, null);
		});

		it("should handle trailing slashes consistently", () => {
			const params1 = extractPathParams("/users/123/", "/users/:id");
			assert.deepStrictEqual(params1, { id: "123" });

			const params2 = extractPathParams("/users/123", "/users/:id/");
			assert.deepStrictEqual(params2, { id: "123" });
		});

		it("should handle root path", () => {
			const params = extractPathParams("/", "/");
			assert.deepStrictEqual(params, {});
		});

		it("should extract slug-style parameters", () => {
			const params = extractPathParams(
				"/weather/san-francisco",
				"/weather/:city"
			);
			assert.deepStrictEqual(params, { city: "san-francisco" });
		});

		it("should extract alphanumeric parameters", () => {
			const params = extractPathParams("/users/user123abc", "/users/:userId");
			assert.deepStrictEqual(params, { userId: "user123abc" });
		});

		it("should handle complex multi-segment paths", () => {
			const params = extractPathParams(
				"/api/v1/users/123/posts/456",
				"/api/v1/users/:userId/posts/:postId"
			);
			assert.deepStrictEqual(params, { userId: "123", postId: "456" });
		});
	});

	describe("Route Catalog Normalization (v2)", () => {
		it("should map different param values to same route template", () => {
			const template = patternToRouteTemplate("/weather/:city");

			// All these concrete paths should map to same route template
			const params1 = extractPathParams("/weather/tokyo", "/weather/:city");
			const params2 = extractPathParams("/weather/london", "/weather/:city");
			const params3 = extractPathParams("/weather/new-york", "/weather/:city");

			assert.strictEqual(template, "/weather/:city");
			assert.notStrictEqual(params1, null);
			assert.notStrictEqual(params2, null);
			assert.notStrictEqual(params3, null);
		});

		it("should differentiate routes by structure, not param values", () => {
			const singleParam = extractPathParams("/weather/tokyo", "/weather/:city");
			const doubleParam = extractPathParams(
				"/weather/jp/tokyo",
				"/weather/:country/:city"
			);

			// Different route structures
			assert.notStrictEqual(singleParam, null);
			assert.notStrictEqual(doubleParam, null);
			assert.notDeepStrictEqual(singleParam, doubleParam);
		});
	});
});
