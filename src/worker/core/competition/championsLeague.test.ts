import { describe, expect, test } from "vitest";
import {
	drawChampionsLeagueGroups,
	getChampionsLeagueCountryCoefficients,
	getChampionsLeagueFieldSize,
	getChampionsLeagueFirstKnockoutRound,
	getChampionsLeagueGroupSchedule,
	getChampionsLeagueGroupTable,
	getChampionsLeagueKnockoutWinner,
	getChampionsLeaguePrize,
	getChampionsLeagueQualifiers,
	isChampionsLeagueCupTied,
} from "./championsLeague.ts";
import { validateChampionsLeagueState } from "./championsLeagueSchedule.ts";

const countries = (count: number) =>
	Array.from({ length: count }, (_, countryId) => ({
		countryId,
		coefficient: count - countryId,
		table: Array.from({ length: 8 }, (__, index) => ({
			tid: countryId * 10 + index,
		})),
	}));

describe("Champions League qualification", () => {
	test("uses an eight-club or sixteen-club field", () => {
		expect(getChampionsLeagueFieldSize(2)).toBe(8);
		expect(getChampionsLeagueFieldSize(4)).toBe(8);
		expect(getChampionsLeagueFieldSize(5)).toBe(16);
		expect(getChampionsLeagueFieldSize(7)).toBe(16);
		expect(() => getChampionsLeagueFieldSize(1)).toThrow(/2 to 7/);
	});

	test("qualifies every champion and runner-up, then cycles extras by coefficient", () => {
		const qualifiers = getChampionsLeagueQualifiers(countries(3));
		expect(qualifiers).toHaveLength(8);
		for (const countryId of [0, 1, 2]) {
			expect(
				qualifiers
					.filter((row) => row.countryId === countryId)
					.map((row) => row.domesticPosition),
			).toEqual(countryId < 2 ? [1, 2, 3] : [1, 2]);
		}
	});

	test("falls through to Countries that still have an eligible club", () => {
		const input = countries(2);
		input[0]!.table = input[0]!.table.slice(0, 2);
		const qualifiers = getChampionsLeagueQualifiers(input);
		expect(qualifiers).toHaveLength(8);
		expect(qualifiers.filter((row) => row.countryId === 1)).toHaveLength(6);
	});
});

describe("Champions League groups", () => {
	const qualifiers = getChampionsLeagueQualifiers(countries(4));

	test("draws four-club groups without same-Country opponents when possible", () => {
		const groups = drawChampionsLeagueGroups(qualifiers);
		expect(groups.map((group) => group.length)).toEqual([4, 4]);
		for (const group of groups) {
			expect(new Set(group.map((row) => row.countryId)).size).toBe(4);
		}
	});

	test("builds a double round robin with no club duplicated on a matchday", () => {
		const schedule = getChampionsLeagueGroupSchedule(
			drawChampionsLeagueGroups(qualifiers),
		);
		expect(schedule).toHaveLength(24);
		for (let matchday = 0; matchday < 6; matchday++) {
			const tids = schedule
				.filter((game) => game.matchday === matchday)
				.flatMap((game) => [game.homeTid, game.awayTid]);
			expect(new Set(tids).size).toBe(8);
		}
	});

	test("validates a persisted draw and rejects a corrupted group", () => {
		const groups = drawChampionsLeagueGroups(qualifiers);
		const state = {
			season: 2030,
			qualifiers,
			groups: groups.map((group) => group.map((row) => row.tid)),
			groupGames: getChampionsLeagueGroupSchedule(groups),
			knockoutSeeds: [],
			knockoutGames: [],
			scheduledGames: [],
			pointsByCountry: {},
			prizeMoneyByTid: Object.fromEntries(
				qualifiers.map((qualifier) => [qualifier.tid, 1000]),
			),
		};
		expect(() => validateChampionsLeagueState(state)).not.toThrow();

		const corrupted = structuredClone(state);
		corrupted.groups[0]![0] = corrupted.groups[0]![1]!;
		expect(() => validateChampionsLeagueState(corrupted)).toThrow(
			/invalid groups/,
		);
	});

	test("orders a table by points, differential, scoring, head-to-head, and seed", () => {
		const group = qualifiers.slice(0, 4);
		const games = [
			{
				groupId: 0,
				matchday: 0,
				homeTid: group[0]!.tid,
				awayTid: group[1]!.tid,
				homePts: 90,
				awayPts: 80,
			},
			{
				groupId: 0,
				matchday: 0,
				homeTid: group[2]!.tid,
				awayTid: group[3]!.tid,
				homePts: 100,
				awayPts: 90,
			},
			{
				groupId: 0,
				matchday: 1,
				homeTid: group[1]!.tid,
				awayTid: group[2]!.tid,
				homePts: 95,
				awayPts: 90,
			},
		];
		expect(
			getChampionsLeagueGroupTable({ group, games }).map((row) => row.tid),
		).toEqual([group[0]!.tid, group[2]!.tid, group[1]!.tid, group[3]!.tid]);
	});
});

describe("Champions League knockout and coefficients", () => {
	test("cup-ties only a player who changed clubs during the same tournament", () => {
		const cupTie = {
			season: 2030,
			competition: "championsLeague" as const,
			tid: 4,
		};
		expect(isChampionsLeagueCupTied({ cupTie, season: 2030, tid: 4 })).toBe(
			false,
		);
		expect(isChampionsLeagueCupTied({ cupTie, season: 2030, tid: 9 })).toBe(
			true,
		);
		expect(isChampionsLeagueCupTied({ cupTie, season: 2031, tid: 9 })).toBe(
			false,
		);
	});

	test("keeps tournament awards modest and rewards progress", () => {
		expect(getChampionsLeaguePrize("entry")).toBe(1000);
		expect(getChampionsLeaguePrize("draw")).toBeLessThan(
			getChampionsLeaguePrize("win"),
		);
		expect(getChampionsLeaguePrize("win")).toBeLessThan(
			getChampionsLeaguePrize("advance"),
		);
		expect(getChampionsLeaguePrize("advance")).toBeLessThan(
			getChampionsLeaguePrize("champion"),
		);
	});

	test("pairs group winners with runners-up from another group", () => {
		const matchups = getChampionsLeagueFirstKnockoutRound([
			{ tid: 1, seed: 1, groupId: 0, groupPosition: 1 },
			{ tid: 2, seed: 2, groupId: 1, groupPosition: 1 },
			{ tid: 3, seed: 3, groupId: 0, groupPosition: 2 },
			{ tid: 4, seed: 4, groupId: 1, groupPosition: 2 },
		]);
		expect(matchups).toEqual([
			{ homeTid: 1, awayTid: 4 },
			{ homeTid: 2, awayTid: 3 },
		]);
	});

	test("sends the better seed through a tied knockout game", () => {
		expect(
			getChampionsLeagueKnockoutWinner({
				homeTid: 10,
				awayTid: 20,
				homePts: 90,
				awayPts: 90,
				seedByTid: new Map([
					[10, 2],
					[20, 5],
				]),
			}),
		).toBe(10);
	});

	test("keeps only the rolling five coefficient seasons", () => {
		expect(
			getChampionsLeagueCountryCoefficients({
				currentSeason: 2030,
				seasons: [
					{ season: 2025, pointsByCountry: { 1: 100 } },
					{ season: 2026, pointsByCountry: { 1: 3, 2: 2 } },
					{ season: 2030, pointsByCountry: { 1: 4 } },
				],
			}),
		).toEqual(
			new Map([
				[1, 7],
				[2, 2],
			]),
		);
	});
});
