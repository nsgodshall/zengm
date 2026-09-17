import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import {
	decayLegacy,
	describeClubStature,
	getDefaultStatureSeed,
	getLegacyTimeline,
	getSeasonLegacyPoints,
	getStartingLegacy,
	getStature,
	getStatureLabel,
} from "./clubStature.ts";

const entry = (
	season: number,
	tier: number,
	position: number,
	extra: Partial<WorldHistoryEntry> = {},
): WorldHistoryEntry => ({
	season,
	divisionId: tier,
	tier,
	position,
	numClubs: 16,
	pyramidPosition: (tier - 1) * 16 + position,
	points: 50,
	...(position === 1 ? { champion: true } : {}),
	...extra,
});

describe("stature", () => {
	test("finishes are worth more higher up, and fade by half every 12 seasons", () => {
		expect(getSeasonLegacyPoints(entry(2030, 1, 1))).toBe(10);
		expect(getSeasonLegacyPoints(entry(2030, 1, 2))).toBe(7);
		expect(getSeasonLegacyPoints(entry(2030, 1, 4))).toBe(5);
		expect(getSeasonLegacyPoints(entry(2030, 1, 8))).toBe(3);
		expect(getSeasonLegacyPoints(entry(2030, 1, 9))).toBe(2);
		expect(getSeasonLegacyPoints(entry(2030, 2, 1))).toBe(1.5);
		expect(getSeasonLegacyPoints(entry(2030, 3, 5))).toBe(0.5);
		expect(decayLegacy(100, 12)).toBeCloseTo(50);
		expect(getStartingLegacy(1)).toBe(40);
		expect(getStartingLegacy(5)).toBe(5);
	});

	test("perennial champions in a big market are giants, and lower-tier clubs in small markets are minnows", () => {
		// Legacy that always winning settles at, and that always finishing in the
		// second tier settles at
		expect(getStature({ legacy: 178, pop: 10 })).toBeGreaterThanOrEqual(85);
		expect(getStature({ legacy: 53, pop: 2 })).toBeGreaterThan(40);
		expect(getStature({ legacy: 53, pop: 2 })).toBeLessThan(55);
		expect(getStature({ legacy: 18, pop: 0.8 })).toBeLessThan(25);
		expect(getStature({ legacy: 0, pop: 0.1 })).toBe(0);
		expect(getStature({ legacy: 10000, pop: 100 })).toBe(100);
	});

	test("legacy builds season by season from a seed, fading across gaps", () => {
		const timeline = getLegacyTimeline({ legacy: 40, season: 2030 }, [
			entry(2031, 1, 1),
			entry(2029, 1, 1),
			entry(2030, 1, 9),
			entry(2033, 1, 8),
		]);
		expect(timeline.map((row) => row.season)).toEqual([2030, 2031, 2033]);
		expect(timeline[0]!.legacy).toBeCloseTo(40 + 2);
		expect(timeline[1]!.legacy).toBeCloseTo(decayLegacy(42, 1) + 10);
		expect(timeline[2]!.legacy).toBeCloseTo(
			decayLegacy(timeline[1]!.legacy, 2) + 3,
		);

		expect(
			getDefaultStatureSeed({
				history: [entry(2031, 2, 3), entry(2030, 3, 3)],
				tier: 1,
				season: 2040,
			}),
		).toEqual({ legacy: 5, season: 2030 });
		expect(
			getDefaultStatureSeed({ history: [], tier: 2, season: 2040 }),
		).toEqual({ legacy: 15, season: 2040 });
	});

	test("labels tell a club's story before its size", () => {
		const yoYo = [
			entry(2030, 2, 1, { moved: "promoted" }),
			entry(2031, 1, 16, { moved: "relegated" }),
			entry(2032, 2, 1, { moved: "promoted" }),
			entry(2033, 1, 16, { moved: "relegated" }),
			entry(2034, 2, 2, { moved: "promoted" }),
			entry(2035, 1, 15, { moved: "relegated" }),
		];
		expect(getStatureLabel({ stature: 50, tier: 2, history: yoYo })).toBe(
			"Yo-yo club",
		);
		expect(getStatureLabel({ stature: 65, tier: 2, history: [] })).toBe(
			"Sleeping giant",
		);
		const rising = [
			entry(2030, 1, 10, { stature: 40 }),
			entry(2035, 1, 1, { stature: 52 }),
		];
		expect(getStatureLabel({ stature: 52, tier: 1, history: rising })).toBe(
			"Rising",
		);
		const fading = [
			entry(2030, 1, 1, { stature: 80 }),
			entry(2035, 1, 12, { stature: 66 }),
		];
		expect(getStatureLabel({ stature: 66, tier: 1, history: fading })).toBe(
			"Fading",
		);
		expect(getStatureLabel({ stature: 80, tier: 1, history: [] })).toBe(
			"Giant",
		);
		expect(getStatureLabel({ stature: 61, tier: 1, history: [] })).toBe(
			"Big club",
		);
		expect(getStatureLabel({ stature: 45, tier: 1, history: [] })).toBe(
			"Established",
		);
		expect(getStatureLabel({ stature: 30, tier: 2, history: [] })).toBe(
			"Modest",
		);
		expect(getStatureLabel({ stature: 12, tier: 3, history: [] })).toBe(
			"Minnow",
		);
	});

	test("a club's stature now comes from its seed, history, and market", () => {
		const history = [entry(2030, 1, 1), entry(2031, 1, 1)];
		const described = describeClubStature({
			seed: { legacy: 40, season: 2030 },
			history,
			tier: 1,
			pop: 5,
			season: 2032,
		});
		const legacy = getLegacyTimeline({ legacy: 40, season: 2030 }, history).at(
			-1,
		)!.legacy;
		expect(described.stature).toBe(getStature({ legacy, pop: 5 }));
		// Two titles aren't enough to make a club big yet
		expect(described.label).toBe("Established");
	});
});
