import { assert, beforeEach, test } from "vitest";
import { range } from "../../../common/utils.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import type { CompetitionStructure } from "../competition/competitionStructure.ts";
import addDaysToSchedule from "./addDaysToSchedule.ts";
import newSchedule from "./newSchedule.ts";

// A World: Northland has 2 tiers (6 and 5 clubs), Southland has 1 (6 clubs)
const structure: CompetitionStructure = {
	countries: [
		{ countryId: 0, name: "Northland" },
		{ countryId: 1, name: "Southland" },
	],
	competitionDivisions: [
		{ divisionId: 10, countryId: 0, tier: 1, name: "Northland 1" },
		// 8 games is a double round robin of 5 clubs
		{ divisionId: 11, countryId: 0, tier: 2, name: "Northland 2", numGames: 8 },
		{ divisionId: 12, countryId: 1, tier: 1, name: "Southland 1" },
	],
	promotionRelegationLinks: [],
};

// cid/did as getLegacyConfsDivs mirrors them
const teams = [
	...range(6).map((i) => ({
		tid: i,
		seasonAttrs: { cid: 0, did: 0, divisionId: 10 },
	})),
	...range(5).map((i) => ({
		tid: 6 + i,
		seasonAttrs: { cid: 0, did: 1, divisionId: 11 },
	})),
	...range(6).map((i) => ({
		tid: 11 + i,
		seasonAttrs: { cid: 1, did: 2, divisionId: 12 },
	})),
];
const divisionIdByTid = new Map(
	teams.map((t) => [t.tid, t.seasonAttrs.divisionId]),
);

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("countries", structure.countries);
	g.setWithoutSavingToDB(
		"competitionDivisions",
		structure.competitionDivisions,
	);
	g.setWithoutSavingToDB(
		"promotionRelegationLinks",
		structure.promotionRelegationLinks,
	);

	// A double round robin of 6 clubs
	g.setWithoutSavingToDB("numGames", 10);
	g.setWithoutSavingToDB("tradeDeadline", 0.6);
	g.setWithoutSavingToDB("allStarGame", 0.7);
});

test("in a multi-Division World, clubs only play their own Division, a double round robin each", async () => {
	const tids = await newSchedule(teams);
	const games = tids.filter(([homeTid]) => homeTid >= 0);

	const numGamesByTid = new Map<number, number>();
	const pairings = new Set<string>();
	for (const [homeTid, awayTid] of games) {
		assert.strictEqual(
			divisionIdByTid.get(homeTid),
			divisionIdByTid.get(awayTid),
		);

		for (const tid of [homeTid, awayTid]) {
			numGamesByTid.set(tid, (numGamesByTid.get(tid) ?? 0) + 1);
		}

		const key = `${homeTid}@${awayTid}`;
		assert(!pairings.has(key), `${key} is scheduled twice`);
		pairings.add(key);
	}

	for (const t of teams) {
		assert.strictEqual(
			numGamesByTid.get(t.tid),
			t.seasonAttrs.divisionId === 11 ? 8 : 10,
		);
	}
});

test("in a multi-Division World, every day is a full round of every Division, and the trade deadline and All-Star Game get days of their own", async () => {
	const tids = await newSchedule(teams);
	assert.deepStrictEqual(
		tids.filter(([homeTid]) => homeTid < 0),
		[
			[-3, -3],
			[-1, -2],
		],
	);

	const schedule = addDaysToSchedule(
		tids.map(([homeTid, awayTid]) => ({ homeTid, awayTid })),
	);

	// 10 rounds, plus the 2 special days
	assert.strictEqual(schedule.at(-1)!.day, 12);

	for (let day = 1; day <= 12; day++) {
		const gamesToday = schedule.filter((game) => game.day === day);
		if (gamesToday.some((game) => game.homeTid < 0)) {
			assert.strictEqual(gamesToday.length, 1);
		} else {
			// 3 + 2 + 3 games - Northland 2 has 5 clubs, so one rests each round
			assert.strictEqual(gamesToday.length, 8);
		}
	}
});
