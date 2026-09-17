import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import { analyzeStoryYield, type StoryYieldClub } from "./storyYield.ts";

// A Country with two tiers. Each season gives the final order of each tier, top
// first: every table's winner is its champion, the bottom club of the top tier
// goes down, and the winner of the second tier goes up.
const makeClubs = (seasons: { top: number[]; second: number[] }[]) => {
	const histories = new Map<number, WorldHistoryEntry[]>();
	for (const [i, { top, second }] of seasons.entries()) {
		const season = 2030 + i;
		for (const [tier, order] of [
			[1, top],
			[2, second],
		] as const) {
			for (const [j, tid] of order.entries()) {
				const entry: WorldHistoryEntry = {
					season,
					divisionId: tier,
					tier,
					position: j + 1,
					numClubs: order.length,
					pyramidPosition: (tier - 1) * top.length + j + 1,
					points: 30 - j,
				};
				if (j === 0) {
					entry.champion = true;
				}
				if (tier === 1 && j === order.length - 1) {
					entry.moved = "relegated";
				}
				if (tier === 2 && j === 0) {
					entry.moved = "promoted";
				}
				histories.set(tid, [...(histories.get(tid) ?? []), entry]);
			}
		}
	}
	return [...histories].map(([tid, history]): StoryYieldClub => ({
		tid,
		name: `Club ${tid}`,
		countryId: 0,
		history,
	}));
};

const analyze = (clubs: StoryYieldClub[]) =>
	analyzeStoryYield({
		countries: [{ countryId: 0, name: "Northland" }],
		clubs,
	})[0]!;

describe("analyzeStoryYield", () => {
	test("measures title concentration, title runs, dynasties, and first titles", () => {
		// Club 0 wins 5 in a row, then club 1 once, club 0 again, and club 2 5 in
		// a row. Nobody else ever reaches the top tier's top 3.
		const winners = [0, 0, 0, 0, 0, 1, 0, 2, 2, 2, 2, 2];
		const seasons = winners.map((winner, i) => ({
			top: [winner, ...[0, 1, 2].filter((tid) => tid !== winner), 3 + (i % 2)],
			second: [4 - (i % 2), 5, 6],
		}));
		const result = analyze(makeClubs(seasons));

		expect(result.seasons).toBe(12);
		expect(result.topTier.champions).toEqual(
			winners.map((winner) => `Club ${winner}`),
		);
		expect(result.topTier.longestTitleRun).toEqual({
			name: "Club 0",
			from: 2030,
			to: 2034,
			titles: 5,
		});
		expect(result.topTier.dynasties).toEqual([
			{ name: "Club 0", from: 2030, to: 2036, titles: 6 },
			{ name: "Club 2", from: 2037, to: 2041, titles: 5 },
		]);
		expect(result.topTier.numFirstTitles).toBe(2);

		// 3 runs of 10 seasons: 2030-2039, 2031-2040, and 2032-2041
		expect(result.topTier.windowSeasons).toBe(10);
		expect(result.topTier.distinctChampions).toEqual({
			mean: 3,
			min: 3,
			max: 3,
		});
		expect(result.topTier.mostTitlesByOneClub).toEqual({
			mean: 16 / 3,
			max: 6,
		});
	});

	test("finds big clubs and their challengers, yo-yo clubs, and clubs that never go down", () => {
		const seasons = [
			{ top: [0, 1, 2, 3, 4], second: [5, 6, 7, 8, 9] },
			{ top: [0, 1, 2, 3, 5], second: [4, 6, 7, 8, 9] },
			{ top: [0, 1, 2, 3, 4], second: [5, 6, 7, 8, 9] },
			{ top: [0, 1, 2, 3, 5], second: [4, 6, 7, 8, 9] },
			{ top: [0, 1, 2, 3, 4], second: [5, 6, 7, 8, 9] },
			// Club 5 comes up and wins twice
			{ top: [5, 0, 1, 2, 3], second: [4, 6, 7, 8, 9] },
			{ top: [5, 0, 1, 2, 4], second: [3, 6, 7, 8, 9] },
			{ top: [0, 1, 2, 5, 3], second: [4, 6, 7, 8, 9] },
		];
		const result = analyze(makeClubs(seasons));
		const { bigClubs } = result.topTier;

		// Clubs 0, 1, and 2 are the big clubs from the sixth season on
		expect(bigClubs.seasons).toBe(3);
		expect(bigClubs.shareWithTwoInTopFour).toBe(1);
		expect(bigClubs.shareOfTitles).toBe(1 / 3);
		expect(bigClubs.challengerTitles).toEqual([
			{ name: "Club 5", season: 2035 },
			{ name: "Club 5", season: 2036 },
		]);
		expect(bigClubs.giantsRelegated).toEqual([]);
		expect(bigClubs.biggestAtStart).toBe("Club 0");

		expect(result.movement.numNeverLeftTopTier).toBe(3);
		expect(result.movement.yoYos).toEqual([
			{ name: "Club 4", from: 2030, to: 2039 },
		]);
		// Two tiers have no real bottom to climb from: that would just be promotion
		expect(result.movement.bottomToTop).toEqual([]);
		expect(result.movement.climbs).toEqual([]);
		expect(result.lowerTierDistinctChampionShare).toEqual({ 2: 3 / 8 });

		// Every club promoted went straight back down, except club 5 after 2035
		expect(result.movement.promotedToTop).toBe(7);
		expect(result.movement.promotedToTopStraightDown).toBe(6 / 7);
	});
});
