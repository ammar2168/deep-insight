import { describe, expect, it } from "vitest";
import { normalizeInsightsShape } from "@/server/ai/insights";

const VALID_INSIGHT = {
	category: "mood",
	label: "Mood",
	value: "You felt calm.",
};

describe("normalizeInsightsShape", () => {
	it("accepts a real, well-formed array as-is", () => {
		expect(normalizeInsightsShape([VALID_INSIGHT])).toEqual([VALID_INSIGHT]);
	});

	it("accepts an empty array", () => {
		expect(normalizeInsightsShape([])).toEqual([]);
	});

	it("recovers the real bug: insights serialized as a JSON string", () => {
		const raw = JSON.stringify([VALID_INSIGHT]);
		expect(normalizeInsightsShape(raw)).toEqual([VALID_INSIGHT]);
	});

	it("rejects a string that isn't valid JSON", () => {
		expect(normalizeInsightsShape("not json at all")).toBeNull();
	});

	it("rejects a string that parses but isn't an array", () => {
		expect(normalizeInsightsShape(JSON.stringify({ foo: "bar" }))).toBeNull();
	});

	it("rejects an array containing a malformed item", () => {
		const bad = [VALID_INSIGHT, { category: "mood", label: "Missing value" }];
		expect(normalizeInsightsShape(bad)).toBeNull();
	});

	it("rejects an item with a category outside the real enum", () => {
		const bad = [{ category: "not-a-real-category", label: "L", value: "V" }];
		expect(normalizeInsightsShape(bad)).toBeNull();
	});

	it("rejects non-array, non-string shapes outright", () => {
		expect(normalizeInsightsShape(null)).toBeNull();
		expect(normalizeInsightsShape(undefined)).toBeNull();
		expect(normalizeInsightsShape({ insights: [VALID_INSIGHT] })).toBeNull();
	});
});
