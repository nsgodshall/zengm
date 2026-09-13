import { expect, test } from "vitest";
import type { CompetitionStructure } from "./competitionStructure.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";
import planEndOfSeason from "./planEndOfSeason.ts";

const makeTable = (tids: number[]): DivisionTableRow[] =>
	tids.map((tid, i) => ({
		tid,
		won: 0,
		lost: 0,
		tied: 0,
		pointDiff: 0,
		scored: 0,
		points: 0,
		rank: i + 1,
	}));

// Northland: 1 up and 1 down. Southland: 1 up automatically, 1 more through a
// 4-club playoff, and 2 down.
const structure: CompetitionStructure = {
	countries: [
		{ countryId: 0, name: "Northland" },
		{ countryId: 1, name: "Southland" },
	],
	competitionDivisions: [
		{ divisionId: 1, countryId: 0, tier: 1, name: "Northland 1" },
		{ divisionId: 2, countryId: 0, tier: 2, name: "Northland 2" },
		{ divisionId: 3, countryId: 1, tier: 1, name: "Southland 1" },
		{ divisionId: 4, countryId: 1, tier: 2, name: "Southland 2" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 0,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 1,
			numAutoRelegated: 1,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
		{
			id: 2,
			countryId: 1,
			upperDivisionId: 3,
			lowerDivisionId: 4,
			numAutoPromoted: 1,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 4,
			numPromotionPlayoffSpots: 1,
		},
	],
};

const tables = {
	1: makeTable([1, 2, 3, 4]),
	2: makeTable([5, 6, 7, 8]),
	3: makeTable([11, 12, 13, 14, 15, 16]),
	4: makeTable([21, 22, 23, 24, 25, 26]),
};

test("crowns every Division's champion, plays the promotion playoff, and moves clubs both ways", async () => {
	const games: [number, number][] = [];
	const plan = await planEndOfSeason(
		structure,
		tables,
		async (homeTid, awayTid) => {
			games.push([homeTid, awayTid]);
			return homeTid;
		},
	);

	expect(
		plan.champions.map(({ division, row }) => [division.divisionId, row.tid]),
	).toEqual([
		[1, 1],
		[2, 5],
		[3, 11],
		[4, 21],
	]);

	// Southland 2's 2nd-5th play off, and the home side always wins
	expect(games).toEqual([
		[22, 25],
		[23, 24],
		[22, 23],
	]);
	expect([...plan.playoffWinnerTids]).toEqual([22]);

	expect(plan.moves).toEqual([
		{ tid: 5, fromDivisionId: 2, toDivisionId: 1 },
		{ tid: 4, fromDivisionId: 1, toDivisionId: 2 },
		{ tid: 21, fromDivisionId: 4, toDivisionId: 3 },
		{ tid: 15, fromDivisionId: 3, toDivisionId: 4 },
		{ tid: 16, fromDivisionId: 3, toDivisionId: 4 },
		{ tid: 22, fromDivisionId: 4, toDivisionId: 3 },
	]);
});

test("every Division keeps its size", async () => {
	const plan = await planEndOfSeason(
		structure,
		tables,
		async (homeTid) => homeTid,
	);

	for (const division of structure.competitionDivisions) {
		const numIn = plan.moves.filter(
			(move) => move.toDivisionId === division.divisionId,
		).length;
		const numOut = plan.moves.filter(
			(move) => move.fromDivisionId === division.divisionId,
		).length;
		expect(numIn).toBe(numOut);
	}
});
