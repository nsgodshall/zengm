import { expect, test } from "vitest";
import computeDivisionTable, {
	type HeadToHeadRecord,
} from "./computeDivisionTable.ts";

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

// Each game is [tid, otherTid, result for tid]
const makeGetHeadToHead = (games: [number, number, "win" | "tie"][]) => {
	const records = new Map<string, HeadToHeadRecord>();
	const add = (tid: number, otherTid: number, key: keyof HeadToHeadRecord) => {
		const record = records.get(`${tid}-${otherTid}`) ?? {
			won: 0,
			lost: 0,
			tied: 0,
		};
		record[key] += 1;
		records.set(`${tid}-${otherTid}`, record);
	};
	for (const [tid, otherTid, result] of games) {
		if (result === "tie") {
			add(tid, otherTid, "tied");
			add(otherTid, tid, "tied");
		} else {
			add(tid, otherTid, "won");
			add(otherTid, tid, "lost");
		}
	}
	return (tid: number, otherTid: number) => records.get(`${tid}-${otherTid}`);
};

test("breaks ties on points and point differential by head-to-head, before scored", () => {
	const table = computeDivisionTable(
		[
			{ tid: 1, won: 10, lost: 10, tied: 0, pointDiff: 5, scored: 100 },
			{ tid: 2, won: 10, lost: 10, tied: 0, pointDiff: 5, scored: 200 },
		],
		{
			getHeadToHead: makeGetHeadToHead([
				[1, 2, "win"],
				[1, 2, "win"],
			]),
		},
	);

	// 2 scored more, but 1 beat 2 twice
	expect(table.map((row) => row.tid)).toEqual([1, 2]);
});

test("head-to-head among 3 level clubs uses a mini-table of their games, and ignores clubs that aren't level", () => {
	const table = computeDivisionTable(
		[
			// Clear on points, so its results against 1 don't matter
			{ tid: 4, won: 12, lost: 8, tied: 0, pointDiff: 0, scored: 0 },
			{ tid: 1, won: 10, lost: 10, tied: 0, pointDiff: 0, scored: 10 },
			{ tid: 2, won: 10, lost: 10, tied: 0, pointDiff: 0, scored: 50 },
			{ tid: 3, won: 10, lost: 10, tied: 0, pointDiff: 0, scored: 60 },
		],
		{
			getHeadToHead: makeGetHeadToHead([
				// 1 vs 2: 1 wins twice. 1: 6 points, 2: 0
				[1, 2, "win"],
				[1, 2, "win"],
				// 2 vs 3: a win and a tie for 2. 2: 4 points, 3: 1
				[2, 3, "win"],
				[2, 3, "tie"],
				// 1 vs 3: one win each. 1: 3 points, 3: 3
				[3, 1, "win"],
				[1, 3, "win"],
				[1, 4, "win"],
				[1, 4, "win"],
			]),
		},
	);

	// Mini-table: 1 has 9, 2 and 3 have 4 each, so scored puts 3 ahead of 2
	expect(table.map((row) => row.tid)).toEqual([4, 1, 3, 2]);
});
