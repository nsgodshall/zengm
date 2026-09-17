import { describe, expect, test } from "vitest";
import { getClubLegends, type LegendPlayer } from "./clubLegends.ts";

type Row = {
	tid: number;
	season: number;
	playoffs: boolean;
	gp: number;
	pts: number;
};

const player = (
	pid: number,
	name: string,
	rows: [tid: number, season: number, gp: number, pts: number][],
	extra: Partial<LegendPlayer<Row>> = {},
): LegendPlayer<Row> => ({
	pid,
	firstName: name,
	lastName: "Player",
	stats: rows.map(([tid, season, gp, pts]) => ({
		tid,
		season,
		playoffs: false,
		gp,
		pts,
	})),
	statsTids: [...new Set(rows.map(([tid]) => tid))],
	...extra,
});

describe("getClubLegends", () => {
	const players = [
		// A one-club player who came through the academy
		player(
			1,
			"Ann",
			[
				[0, 2030, 30, 300],
				[0, 2031, 30, 400],
			],
			{
				transactions: [{ type: "academy", tid: 0 }],
			},
		),
		// The club's top scorer, who also played elsewhere
		player(2, "Bo", [
			[0, 2032, 20, 900],
			[1, 2033, 30, 100],
		]),
		// Playoff games and games for other clubs don't count
		player(3, "Cy", [
			[1, 2030, 30, 500],
			[0, 2031, 10, 50],
		]),
		player(4, "Di", [[0, 2030, 0, 0]]),
	];

	const legends = getClubLegends({
		players,
		tid: 0,
		getScore: (row) => row.pts,
	});

	test("names the club's most-used players and top scorers", () => {
		expect(
			legends.mostAppearances.map((legend) => [legend.name, legend.gp]),
		).toEqual([
			["Ann Player", 60],
			["Bo Player", 20],
			["Cy Player", 10],
		]);
		expect(
			legends.topScorers.map((legend) => [legend.name, legend.value]),
		).toEqual([
			["Bo Player", 900],
			["Ann Player", 700],
			["Cy Player", 50],
		]);
		expect(legends.mostAppearances[0]).toMatchObject({
			firstSeason: 2030,
			lastSeason: 2031,
			oneClub: true,
			academy: true,
		});
	});

	test("knows one-club players and academy graduates", () => {
		expect(legends.oneClubPlayers.map((legend) => legend.pid)).toEqual([1]);
		expect(legends.academyGraduates.map((legend) => legend.pid)).toEqual([1]);
	});
});
