import { expect, test } from "vitest";
import computeDivisionTable from "./computeDivisionTable.ts";

test("sorts by points first", () => {
	const table = computeDivisionTable([
		{ tid: 1, won: 10, lost: 5, tied: 5, pointDiff: 0, scored: 0 }, // 10*3+5 = 35
		{ tid: 2, won: 12, lost: 6, tied: 2, pointDiff: 0, scored: 0 }, // 12*3+2 = 38
	]);

	expect(table.map((row) => row.tid)).toEqual([2, 1]);
	expect(table[0]!.rank).toBe(1);
	expect(table[0]!.points).toBe(38);
	expect(table[1]!.rank).toBe(2);
});

test("breaks ties by point differential, then scored, then wins, then tid", () => {
	const table = computeDivisionTable([
		{ tid: 5, won: 10, lost: 10, tied: 0, pointDiff: 5, scored: 20 },
		{ tid: 3, won: 10, lost: 10, tied: 0, pointDiff: 10, scored: 10 },
		{ tid: 4, won: 10, lost: 10, tied: 0, pointDiff: 10, scored: 15 },
	]);

	// All 3 have the same points (30). 3 and 4 tie on pointDiff (10 > 5), so
	// "scored" breaks that tie (15 > 10).
	expect(table.map((row) => row.tid)).toEqual([4, 3, 5]);
});

test("respects a custom points formula", () => {
	const table = computeDivisionTable(
		[
			{ tid: 1, won: 5, lost: 0, tied: 5, pointDiff: 0, scored: 0 },
			{ tid: 2, won: 6, lost: 4, tied: 0, pointDiff: 0, scored: 0 },
		],
		{ winPoints: 2, tiePoints: 1 },
	);

	// Old British football scoring (2/1/0): team 1 = 5*2+5 = 15, team 2 = 6*2 = 12
	expect(table.map((row) => row.tid)).toEqual([1, 2]);
});

test("is deterministic when everything else is tied", () => {
	const table = computeDivisionTable([
		{ tid: 9, won: 1, lost: 1, tied: 1, pointDiff: 0, scored: 0 },
		{ tid: 2, won: 1, lost: 1, tied: 1, pointDiff: 0, scored: 0 },
	]);

	expect(table.map((row) => row.tid)).toEqual([2, 9]);
});
