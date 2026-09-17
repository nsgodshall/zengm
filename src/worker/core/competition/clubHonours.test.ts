import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import { getClubHonours, getDynasties } from "./clubHonours.ts";

// One entry per season from 2020: its tier, position, and C for champion, U for
// promoted (P through the playoff, L for losing one), D for relegated
const makeHistory = (seasons: string[]): WorldHistoryEntry[] =>
	seasons.map((code, i) => {
		const [tier, position] = code.split(/[A-Z]/)[0]!.split(".").map(Number);
		const entry: WorldHistoryEntry = {
			season: 2020 + i,
			divisionId: 10 + tier!,
			tier: tier!,
			position: position!,
			numClubs: 16,
			pyramidPosition: (tier! - 1) * 16 + position!,
			points: 50,
		};
		if (code.includes("C")) {
			entry.champion = true;
		}
		if (code.includes("U") || code.includes("P")) {
			entry.moved = "promoted";
		}
		if (code.includes("P")) {
			entry.promotionPlayoff = "won";
		}
		if (code.includes("L")) {
			entry.promotionPlayoff = "lost";
		}
		if (code.includes("D")) {
			entry.moved = "relegated";
		}
		return entry;
	});

describe("getDynasties", () => {
	test("joins overlapping runs of 3 titles in 5 seasons", () => {
		expect(
			getDynasties([2020, 2021, 2023, 2024, 2030, 2040, 2041, 2044]),
		).toEqual([
			{ from: 2020, to: 2024, titles: 4 },
			{ from: 2040, to: 2044, titles: 3 },
		]);
		expect(getDynasties([2020, 2022, 2025])).toEqual([]);
	});
});

describe("getClubHonours", () => {
	test("counts titles, moves, playoffs, and seasons on each tier", () => {
		const honours = getClubHonours(
			makeHistory([
				"2.4L",
				"2.1CU",
				"1.14",
				"1.16D",
				"2.3P",
				"1.2",
				"1.1C",
				"1.1C",
				"1.3",
				"1.1C",
			]),
		);

		expect(honours.numSeasons).toBe(10);
		expect(honours.titles).toEqual([
			{ tier: 1, divisionId: 11, seasons: [2026, 2027, 2029] },
			{ tier: 2, divisionId: 12, seasons: [2021] },
		]);
		expect(honours.dynasties).toEqual([{ from: 2026, to: 2029, titles: 3 }]);
		expect(honours.promotions).toEqual([
			{ season: 2021, viaPlayoff: false },
			{ season: 2024, viaPlayoff: true },
		]);
		expect(honours.relegations).toEqual([2023]);
		expect(honours.promotionPlayoffs).toEqual({ won: 1, lost: 1 });
		expect(honours.seasonsByTier).toEqual([
			{ tier: 1, divisionId: 11, seasons: 7 },
			{ tier: 2, divisionId: 12, seasons: 3 },
		]);
		expect(honours.bestFinish).toEqual({
			tier: 1,
			divisionId: 11,
			position: 1,
			seasons: [2026, 2027, 2029],
		});
		expect(honours.topTierRun).toEqual({ current: 5, longest: 5 });
		expect(honours.neverRelegated).toBe(false);
	});

	test("a club with no history has no honours", () => {
		const honours = getClubHonours([]);
		expect(honours.titles).toEqual([]);
		expect(honours.bestFinish).toBeUndefined();
		expect(honours.topTierRun).toEqual({ current: 0, longest: 0 });
		expect(honours.neverRelegated).toBe(false);
	});

	test("a top-tier run ends when a club goes down, and a gap in history breaks it", () => {
		const history = makeHistory(["1.5", "1.5", "1.16D", "2.1CU", "1.8"]);
		expect(getClubHonours(history).topTierRun).toEqual({
			current: 1,
			longest: 3,
		});
		expect(
			getClubHonours([
				history[0]!,
				history[1]!,
				{ ...history[4]!, season: 2030 },
			]).topTierRun,
		).toEqual({ current: 1, longest: 2 });
		expect(getClubHonours(makeHistory(["1.5", "1.2"])).neverRelegated).toBe(
			true,
		);
	});
});
