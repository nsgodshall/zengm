import { describe, expect, test } from "vitest";
import type { WorldSeasonRuns } from "../../../common/types.ts";
import { getCountryRecords, type RecordSeason } from "./worldRecords.ts";

const runs = (partial: Partial<WorldSeasonRuns>): WorldSeasonRuns => ({
	winning: 0,
	unbeaten: 0,
	losing: 0,
	winless: 0,
	longestWinning: 0,
	longestUnbeaten: 0,
	longestLosing: 0,
	longestWinless: 0,
	...partial,
});

const season = (
	tid: number,
	season: number,
	tier: number,
	points: number,
	extra: Partial<RecordSeason> = {},
): RecordSeason => ({
	tid,
	season,
	tier,
	points,
	won: points / 3,
	lost: 10 - points / 3,
	tied: 0,
	...extra,
});

describe("getCountryRecords", () => {
	const seasons = [
		// Club 0: four top-tier seasons, champions three in a row
		season(0, 2030, 1, 24, { champion: true }),
		season(0, 2031, 1, 27, {
			champion: true,
			runs: runs({ longestWinning: 8, longestUnbeaten: 9 }),
		}),
		season(0, 2032, 1, 30, {
			champion: true,
			runs: runs({
				longestWinning: 10,
				longestUnbeaten: 10,
				biggestWin: {
					margin: 40,
					pts: 120,
					oppPts: 80,
					opponentTid: 1,
					gid: 5,
				},
			}),
		}),
		season(0, 2033, 1, 18),
		// Club 1: three top-tier seasons, one title, then relegated
		season(1, 2030, 1, 21),
		season(1, 2031, 1, 12),
		season(1, 2032, 1, 9),
		season(1, 2033, 1, 21, { champion: true }),
		// Club 2: a second-tier club with one top-tier season
		season(2, 2032, 2, 30, { champion: true }),
		season(2, 2033, 1, 6, { runs: runs({ longestLosing: 12 }) }),
	];

	const records = getCountryRecords({ seasons });

	test("the all-time table counts only top-tier seasons, best first", () => {
		expect(
			records.allTimeTable.map((row) => [
				row.tid,
				row.seasons,
				row.points,
				row.titles,
			]),
		).toEqual([
			[0, 4, 99, 3],
			[1, 4, 63, 1],
			[2, 1, 6, 0],
		]);
		expect(records.mostTitles).toEqual([
			{ tid: 0, value: 3 },
			{ tid: 1, value: 1 },
		]);
	});

	test("records name the club and season that set them", () => {
		expect(records.mostPoints).toEqual({ tid: 0, season: 2032, value: 30 });
		expect(records.fewestPoints).toEqual({ tid: 2, season: 2033, value: 6 });
		expect(records.longestTitleRun).toEqual({
			tid: 0,
			value: 3,
			from: 2030,
			to: 2032,
		});
		expect(records.longestTopFlightRun).toEqual({
			tid: 0,
			value: 4,
			from: 2030,
			to: 2033,
		});
		expect(records.longestWinningRun).toEqual({
			tid: 0,
			season: 2032,
			value: 10,
		});
		expect(records.longestUnbeatenRun).toEqual({
			tid: 0,
			season: 2032,
			value: 10,
		});
		expect(records.biggestWin).toEqual({
			tid: 0,
			season: 2032,
			value: 40,
			opponentTid: 1,
			text: "120-80",
		});
	});

	test("one title or one season up isn't a record", () => {
		const oneEach = getCountryRecords({
			seasons: [season(0, 2030, 1, 24, { champion: true })],
		});
		expect(oneEach.longestTitleRun).toBe(undefined);
		expect(oneEach.longestTopFlightRun).toBe(undefined);
		expect(oneEach.mostTitles).toEqual([{ tid: 0, value: 1 }]);
	});

	test("a Country with no finished seasons has no records", () => {
		const empty = getCountryRecords({ seasons: [] });
		expect(empty.allTimeTable).toEqual([]);
		expect(empty.mostPoints).toBe(undefined);
		expect(empty.longestTitleRun).toBe(undefined);
	});
});
