import { describe, expect, it } from "vitest";
import { normalizeInsightsShape } from "@/server/ai/insights";

const VALID_INSIGHT = {
	category: "mood",
	label: "Mood",
	value: "You felt calm.",
};

describe("normalizeInsightsShape", () => {
	it("accepts a real, well-formed array as-is", () => {
		expect(normalizeInsightsShape([VALID_INSIGHT])).toEqual({
			insights: [VALID_INSIGHT],
			dropped: 0,
		});
	});

	it("accepts an empty array", () => {
		expect(normalizeInsightsShape([])).toEqual({ insights: [], dropped: 0 });
	});

	it("recovers the real bug: insights serialized as a JSON string", () => {
		const raw = JSON.stringify([VALID_INSIGHT]);
		expect(normalizeInsightsShape(raw)).toEqual({
			insights: [VALID_INSIGHT],
			dropped: 0,
		});
	});

	it("rejects a string that isn't valid JSON", () => {
		expect(normalizeInsightsShape("not json at all")).toBeNull();
	});

	it("rejects a string that parses but isn't an array", () => {
		expect(normalizeInsightsShape(JSON.stringify({ foo: "bar" }))).toBeNull();
	});

	// The prod incident this whole function exists for: rejecting the batch
	// over one bad item cost 4 of 8 days of a 50-page upload. Keep the good
	// ones, drop only what can't be trusted.
	it("keeps the good items and drops a malformed one", () => {
		const mixed = [VALID_INSIGHT, { category: "mood", label: "No value" }];
		expect(normalizeInsightsShape(mixed)).toEqual({
			insights: [VALID_INSIGHT],
			dropped: 1,
		});
	});

	it("drops an item whose category is outside the real enum, keeping the rest", () => {
		const mixed = [
			VALID_INSIGHT,
			{ category: "productivity", label: "L", value: "V" },
		];
		expect(normalizeInsightsShape(mixed)).toEqual({
			insights: [VALID_INSIGHT],
			dropped: 1,
		});
	});

	it("rejects an array where every item is unusable, so the caller retries", () => {
		const allBad = [
			{ category: "not-a-real-category", label: "L", value: "V" },
		];
		expect(normalizeInsightsShape(allBad)).toBeNull();
	});

	it("recovers a double-encoded string", () => {
		const doubled = JSON.stringify(JSON.stringify([VALID_INSIGHT]));
		expect(normalizeInsightsShape(doubled)).toEqual({
			insights: [VALID_INSIGHT],
			dropped: 0,
		});
	});

	it("rejects non-array, non-string shapes outright", () => {
		expect(normalizeInsightsShape(null)).toBeNull();
		expect(normalizeInsightsShape(undefined)).toBeNull();
		expect(normalizeInsightsShape({ insights: [VALID_INSIGHT] })).toBeNull();
	});
});
