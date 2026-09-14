import { describe, expect, test } from "vitest";
import type { CompetitionStructure } from "./competitionStructure.ts";
import computeDivisionTable from "./computeDivisionTable.ts";
import { summarizeWorldSeason } from "./seasonSummary.ts";

const structure: CompetitionStructure = {
	countries: [{ countryId: 0, name: "Northland" }],
	competitionDivisions: [
		{ divisionId: 2, countryId: 0, tier: 2, name: "Second" },
		{ divisionId: 1, countryId: 0, tier: 1, name: "Top" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 0,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 1,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 2,
			numPromotionPlayoffSpots: 1,
		},
	],
};

// Clubs finish in the order given
const makeTable = (tids: number[], played = true) =>
	computeDivisionTable(
		tids.map((tid, i) => ({
			tid,
			won: played ? 10 - i : 0,
			lost: played ? i : 0,
			tied: 0,
			pointDiff: 0,
			scored: 0,
		})),
		{},
	);

describe("summarizeWorldSeason", () => {
	test("names each Division's champion and who went up and down, by tier", () => {
		const summary = summarizeWorldSeason({
			structure,
			tables: { 1: makeTable([0, 1, 2, 3]), 2: makeTable([4, 5, 6, 7]) },
			nextDivisionIdByTid: new Map([
				[0, 1],
				[1, 1],
				[2, 2],
				[3, 2],
				[4, 1],
				[5, 1],
				[6, 2],
				[7, 2],
			]),
			playoffGames: [
				{ linkId: 1, round: 0, winnerTid: 6 },
				{ linkId: 1, round: 1, winnerTid: 5 },
			],
		});

		expect(summary).toHaveLength(1);
		const [top, second] = summary[0]!.divisions;
		expect(top!.name).toBe("Top");
		expect(top!.champion?.tid).toBe(0);
		expect(top!.promoted).toEqual([]);
		expect(top!.relegated).toEqual([2, 3]);

		expect(second!.name).toBe("Second");
		expect(second!.champion?.tid).toBe(4);
		expect(second!.promoted).toEqual([
			{ tid: 4, viaPlayoff: false },
			{ tid: 5, viaPlayoff: true },
		]);
		expect(second!.relegated).toEqual([]);
	});

	test("has no champion before a game is played, and no moves without next season's Divisions", () => {
		const summary = summarizeWorldSeason({
			structure,
			tables: { 1: makeTable([0, 1], false), 2: makeTable([2, 3], false) },
			nextDivisionIdByTid: new Map(),
			playoffGames: [],
		});

		for (const division of summary[0]!.divisions) {
			expect(division.champion).toBeUndefined();
			expect(division.promoted).toEqual([]);
			expect(division.relegated).toEqual([]);
		}
	});
});
