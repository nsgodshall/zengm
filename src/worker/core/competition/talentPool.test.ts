import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import {
	getTalentPoolKey,
	getTalentPoolSize,
	pickTalentPoolCountry,
} from "./talentPool.ts";

describe("getTalentPoolSize", () => {
	test("half a player for every club", () => {
		expect(getTalentPoolSize(24)).toBe(12);
		expect(getTalentPoolSize(112)).toBe(56);
	});
});

describe("getTalentPoolKey", () => {
	test("the winter window is its season's", () => {
		expect(
			getTalentPoolKey({
				season: 2026,
				phase: PHASE.REGULAR_SEASON,
				window: "winter",
			}),
		).toBe("2026-winter");
	});

	test("the summer window is the same from the end of the season through the next preseason", () => {
		for (const phase of [
			PHASE.DRAFT_LOTTERY,
			PHASE.DRAFT,
			PHASE.AFTER_DRAFT,
			PHASE.RESIGN_PLAYERS,
			PHASE.FREE_AGENCY,
		]) {
			expect(getTalentPoolKey({ season: 2026, phase, window: "summer" })).toBe(
				"2027-summer",
			);
		}
		expect(
			getTalentPoolKey({
				season: 2027,
				phase: PHASE.PRESEASON,
				window: "summer",
			}),
		).toBe("2027-summer");
	});
});

describe("pickTalentPoolCountry", () => {
	// Cumulative weights: USA 70, Serbia 20, France 10
	const frequencies = [
		["USA", 70],
		["Serbia", 90],
		["France", 100],
	] as const;

	test("never picks a World's Country", () => {
		const excluded = new Set(["USA"]);
		for (const r of [0, 0.3, 0.6, 0.66, 0.67, 0.99]) {
			expect(["Serbia", "France"]).toContain(
				pickTalentPoolCountry(frequencies, excluded, () => r),
			);
		}
	});

	test("picks nations by their weights", () => {
		const excluded = new Set(["USA"]);
		expect(pickTalentPoolCountry(frequencies, excluded, () => 0.5)).toBe(
			"Serbia",
		);
		expect(pickTalentPoolCountry(frequencies, excluded, () => 0.7)).toBe(
			"France",
		);
		expect(pickTalentPoolCountry(frequencies, new Set(), () => 0.5)).toBe(
			"USA",
		);
	});

	test("has nobody to pick when every nation is in the World", () => {
		expect(
			pickTalentPoolCountry(frequencies, new Set(["USA", "Serbia", "France"])),
		).toBeUndefined();
	});
});
