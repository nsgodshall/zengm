import { describe, expect, test } from "vitest";
import { getPyramidPosition, getTierBands } from "./pyramidPositions.ts";

// An American-style pyramid of three tiers of 16 clubs
const clubsByTier = new Map([
	[1, 16],
	[2, 16],
	[3, 16],
]);

describe("getPyramidPosition", () => {
	test("a top-tier club's place is its position", () => {
		expect(getPyramidPosition({ tier: 1, position: 3, clubsByTier })).toBe(3);
	});

	test("a lower-tier club comes after every club in the tiers above", () => {
		expect(getPyramidPosition({ tier: 2, position: 1, clubsByTier })).toBe(17);
		expect(getPyramidPosition({ tier: 3, position: 16, clubsByTier })).toBe(48);
	});
});

describe("getTierBands", () => {
	test("each tier covers the places after the tiers above it", () => {
		expect(getTierBands(clubsByTier)).toEqual([
			{ tier: 1, first: 1, last: 16 },
			{ tier: 2, first: 17, last: 32 },
			{ tier: 3, first: 33, last: 48 },
		]);
	});

	test("tiers can have different numbers of clubs, in any order", () => {
		expect(
			getTierBands(
				new Map([
					[2, 12],
					[1, 10],
				]),
			),
		).toEqual([
			{ tier: 1, first: 1, last: 10 },
			{ tier: 2, first: 11, last: 22 },
		]);
	});
});
