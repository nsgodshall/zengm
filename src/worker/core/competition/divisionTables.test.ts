import { expect, test } from "vitest";
import type { CompetitionStructure } from "./competitionStructure.ts";
import { buildDivisionTables } from "./divisionTables.ts";

const structure: CompetitionStructure = {
	countries: [{ countryId: 0, name: "Northland" }],
	competitionDivisions: [
		{ divisionId: 1, countryId: 0, tier: 1, name: "Northland 1" },
		// Old British scoring: 2 points for a win
		{ divisionId: 2, countryId: 0, tier: 2, name: "Northland 2", winPoints: 2 },
		{ divisionId: 3, countryId: 0, tier: 3, name: "Northland 3" },
	],
	promotionRelegationLinks: [],
};

const makeResult = (
	tid: number,
	divisionId: number,
	won: number,
	lost: number,
	tied: number,
) => ({ tid, divisionId, won, lost, tied, pointDiff: 0, scored: 0 });

test("one table per Division, each ranked on its own with its own points", () => {
	const tables = buildDivisionTables(structure, [
		makeResult(1, 1, 5, 5, 0), // 15 points
		makeResult(2, 2, 3, 2, 5), // 2*3 + 5 = 11 points (would be 14 at 3 for a win)
		makeResult(3, 1, 8, 2, 0), // 24 points
		makeResult(4, 2, 5, 5, 0), // 2*5 = 10 points (would be 15 at 3 for a win)
	]);

	expect(tables[1]!.map((row) => [row.tid, row.rank, row.points])).toEqual([
		[3, 1, 24],
		[1, 2, 15],
	]);

	// At 3 points for a win, club 4 would be top instead
	expect(tables[2]!.map((row) => [row.tid, row.rank, row.points])).toEqual([
		[2, 1, 11],
		[4, 2, 10],
	]);

	// A Division with no clubs still gets a table
	expect(tables[3]).toEqual([]);
});

test("throws for a club in a Division that doesn't exist", () => {
	expect(() =>
		buildDivisionTables(structure, [makeResult(9, 99, 0, 0, 0)]),
	).toThrow(/Team 9 is in Division 99, which doesn't exist/);
});
