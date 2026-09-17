import { describe, expect, test } from "vitest";
import type { WorldSeasonRuns } from "../../../common/types.ts";
import {
	addWorldHistoryEntry,
	buildWorldSeasonRecords,
	getClubSeasonLeaders,
	toWorldHistoryEntry,
	updateWorldSeasonRuns,
} from "./clubSeasonRecords.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import computeDivisionTable from "./computeDivisionTable.ts";
import { summarizeWorldSeason } from "./seasonSummary.ts";

const playResults = (results: ("won" | "lost" | "tied")[]) => {
	let runs: WorldSeasonRuns | undefined;
	for (const [i, result] of results.entries()) {
		runs = updateWorldSeasonRuns(runs, {
			result,
			pts: result === "won" ? 100 + i : 90,
			oppPts: result === "lost" ? 100 + i : 90,
			opponentTid: i,
			gid: i,
		});
	}
	return runs!;
};

describe("updateWorldSeasonRuns", () => {
	test("tracks the current and longest winning and losing runs", () => {
		const runs = playResults(["won", "won", "won", "lost", "lost", "won"]);
		expect(runs.winning).toBe(1);
		expect(runs.longestWinning).toBe(3);
		expect(runs.losing).toBe(0);
		expect(runs.longestLosing).toBe(2);
	});

	test("a tie ends a winning run but not an unbeaten one, and ends a losing run but not a winless one", () => {
		const runs = playResults([
			"won",
			"tied",
			"won",
			"won",
			"lost",
			"tied",
			"lost",
		]);
		expect(runs.longestWinning).toBe(2);
		expect(runs.longestUnbeaten).toBe(4);
		expect(runs.unbeaten).toBe(0);
		expect(runs.longestLosing).toBe(1);
		expect(runs.winless).toBe(3);
		expect(runs.longestWinless).toBe(3);
	});

	test("keeps the first biggest win and loss", () => {
		let runs = updateWorldSeasonRuns(undefined, {
			result: "won",
			pts: 110,
			oppPts: 90,
			opponentTid: 1,
			gid: 10,
		});
		runs = updateWorldSeasonRuns(runs, {
			result: "won",
			pts: 95,
			oppPts: 75,
			opponentTid: 2,
			gid: 11,
		});
		runs = updateWorldSeasonRuns(runs, {
			result: "lost",
			pts: 80,
			oppPts: 111,
			opponentTid: 3,
			gid: 12,
		});
		expect(runs.biggestWin).toEqual({
			margin: 20,
			pts: 110,
			oppPts: 90,
			opponentTid: 1,
			gid: 10,
		});
		expect(runs.biggestLoss).toEqual({
			margin: 31,
			pts: 80,
			oppPts: 111,
			opponentTid: 3,
			gid: 12,
		});
	});
});

describe("getClubSeasonLeaders", () => {
	const row = (tid: number, gp: number, pts: number, season = 2030) => ({
		season,
		tid,
		playoffs: false,
		gp,
		pts,
	});

	test("finds each club's top scorer and most-used player, adding up stints", () => {
		const leaders = getClubSeasonLeaders({
			players: [
				{
					pid: 1,
					firstName: "Ann",
					lastName: "A",
					// Two stints at club 0, around a loan at club 1
					stats: [row(0, 10, 200), row(1, 5, 50), row(0, 10, 150)],
				},
				{
					pid: 2,
					firstName: "Bo",
					lastName: "B",
					stats: [row(0, 30, 300), row(0, 5, 500, 2029)],
				},
				{
					pid: 3,
					firstName: "Cy",
					lastName: "C",
					stats: [{ ...row(1, 20, 400), playoffs: true }, row(1, 6, 10)],
				},
			],
			season: 2030,
			getScore: (row) => row.pts,
		});

		expect(leaders.get(0)).toEqual({
			topScorer: { pid: 1, name: "Ann A", value: 350 },
			mostGames: { pid: 2, name: "Bo B", gp: 30 },
		});
		expect(leaders.get(1)).toEqual({
			topScorer: { pid: 1, name: "Ann A", value: 50 },
			mostGames: { pid: 3, name: "Cy C", gp: 6 },
		});
	});

	test("has no top scorer when nobody scored", () => {
		const leaders = getClubSeasonLeaders({
			players: [
				{ pid: 1, firstName: "Ann", lastName: "A", stats: [row(0, 3, 0)] },
			],
			season: 2030,
			getScore: (row) => row.pts,
		});
		expect(leaders.get(0)).toEqual({
			mostGames: { pid: 1, name: "Ann A", gp: 3 },
		});
	});
});

const structure: CompetitionStructure = {
	countries: [{ countryId: 0, name: "Northland" }],
	competitionDivisions: [
		{ divisionId: 1, countryId: 0, tier: 1, name: "Top" },
		{ divisionId: 2, countryId: 0, tier: 2, name: "Second" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 0,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 1,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 3,
			numPromotionPlayoffSpots: 1,
		},
	],
};

// Clubs finish in the order given
const makeTable = (tids: number[]) =>
	computeDivisionTable(
		tids.map((tid, i) => ({
			tid,
			won: 10 - i,
			lost: i,
			tied: 0,
			pointDiff: 50 - 10 * i,
			scored: 1000,
		})),
		{},
	);

describe("buildWorldSeasonRecords", () => {
	const tables = {
		1: makeTable([0, 1, 2, 3, 4]),
		2: makeTable([5, 6, 7, 8, 9]),
	};
	const playoffGames = [
		{ linkId: 1, round: 0, homeTid: 7, awayTid: 8, winnerTid: 7 },
		{ linkId: 1, round: 1, homeTid: 6, awayTid: 7, winnerTid: 7 },
	];
	const summary = summarizeWorldSeason({
		structure,
		tables,
		nextDivisionIdByTid: new Map([
			[0, 1],
			[1, 1],
			[2, 1],
			[3, 2],
			[4, 2],
			[5, 1],
			[6, 2],
			[7, 1],
			[8, 2],
			[9, 2],
		]),
		playoffGames,
	});

	const records = buildWorldSeasonRecords({
		structure,
		tables,
		summary,
		playoffGames,
		teamSeasons: [
			{
				tid: 0,
				ovrStart: 60,
				boardObjective: { kind: "title", targetPosition: 1 },
			},
			{
				tid: 1,
				ovrStart: 70,
				boardObjective: { kind: "title", targetPosition: 1 },
			},
			{ tid: 2, ovrStart: 50 },
			{ tid: 4, ovrStart: 55 },
			{
				tid: 6,
				worldRuns: playResults(["won", "won", "lost"]),
			},
		],
		leadersByTid: new Map([
			[
				0,
				{
					topScorer: { pid: 1, name: "Ann A", value: 350 },
					mostGames: { pid: 2, name: "Bo B", gp: 30 },
				},
			],
		]),
	});

	test("records each club's place, points, and where it went", () => {
		expect(records.get(0)).toEqual({
			divisionId: 1,
			countryId: 0,
			tier: 1,
			position: 1,
			numClubs: 5,
			pyramidPosition: 1,
			points: 30,
			won: 10,
			lost: 0,
			tied: 0,
			pointDiff: 50,
			scored: 1000,
			champion: true,
			squadRank: 2,
			boardObjective: { kind: "title", targetPosition: 1, met: true },
			topScorer: { pid: 1, name: "Ann A", value: 350 },
			mostGames: { pid: 2, name: "Bo B", gp: 30 },
		});

		expect(records.get(3)!.moved).toBe("relegated");
		expect(records.get(4)!.moved).toBe("relegated");
		expect(records.get(2)!.moved).toBeUndefined();

		const secondChampion = records.get(5)!;
		expect(secondChampion.champion).toBe(true);
		expect(secondChampion.moved).toBe("promoted");
		expect(secondChampion.pyramidPosition).toBe(6);
		expect(secondChampion.promotionPlayoff).toBeUndefined();
	});

	test("ranks squads by strength at the first game, and judges board objectives", () => {
		expect(records.get(1)!.squadRank).toBe(1);
		expect(records.get(1)!.boardObjective).toEqual({
			kind: "title",
			targetPosition: 1,
			met: false,
		});
		expect(records.get(4)!.squadRank).toBe(3);
		expect(records.get(3)!.squadRank).toBeUndefined();
	});

	test("knows who won and lost the promotion playoff", () => {
		expect(records.get(7)!.promotionPlayoff).toBe("won");
		expect(records.get(7)!.moved).toBe("promoted");
		expect(records.get(6)!.promotionPlayoff).toBe("lost");
		expect(records.get(8)!.promotionPlayoff).toBe("lost");
		expect(records.get(9)!.promotionPlayoff).toBeUndefined();
	});

	test("keeps the season's runs", () => {
		expect(records.get(6)!.runs?.longestWinning).toBe(2);
	});

	test("gives no record to a club that played no games", () => {
		const unplayed = computeDivisionTable(
			[{ tid: 0, won: 0, lost: 0, tied: 0, pointDiff: 0, scored: 0 }],
			{},
		);
		expect(
			buildWorldSeasonRecords({
				structure,
				tables: { 1: unplayed, 2: [] },
				summary: summarizeWorldSeason({
					structure,
					tables: { 1: unplayed, 2: [] },
					nextDivisionIdByTid: new Map(),
					playoffGames: [],
				}),
				playoffGames: [],
				teamSeasons: [],
			}).size,
		).toBe(0);
	});

	test("a club keeps a short history entry for each season, replacing a season recorded again", () => {
		const entry2030 = toWorldHistoryEntry(2030, records.get(5)!);
		expect(entry2030).toEqual({
			season: 2030,
			divisionId: 2,
			tier: 2,
			position: 1,
			numClubs: 5,
			pyramidPosition: 6,
			points: 30,
			champion: true,
			moved: "promoted",
		});

		const entry2029 = toWorldHistoryEntry(2029, records.get(6)!);
		let history = addWorldHistoryEntry(undefined, entry2030);
		history = addWorldHistoryEntry(history, entry2029);
		history = addWorldHistoryEntry(history, { ...entry2030, points: 31 });
		expect(history.map((entry) => [entry.season, entry.points])).toEqual([
			[2029, 27],
			[2030, 31],
		]);
	});
});
