import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE } from "../common/constants.ts";
import { PILOT_CLUBS_PER_DIVISION } from "../worker/core/competition/pilotWorld.ts";
import { competition, league, phase, season } from "../worker/core/index.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers } from "../worker/util/index.ts";
import { getDefaultSettings } from "../worker/views/newLeague.ts";

// International Soccer Zen GM mod (Epic 7): create the pilot World the way New
// League → World does, and start its first regular season

const STARTING_SEASON = 2026;

describe("the pilot World", () => {
	beforeAll(
		async () => {
			const { structure, clubs } = competition.generatePilotWorld();
			const { confs, divs } = competition.getLegacyConfsDivs(structure);

			await league.createStream(createStreamFromLeagueObject({}), {
				confs,
				divs,
				fromFile: {
					gameAttributes: structure,
					hasRookieContracts: true,
					maxGid: undefined,
					startingSeason: undefined,
					teams: undefined,
					version: LEAGUE_DATABASE_VERSION,
				},
				getLeagueOptions: undefined,
				keptKeys: new Set(["gameAttributes"] as const),
				lid: 0,
				name: "Pilot World",
				setLeagueCreationStatus: () => {},
				settings: getDefaultSettings(),
				shuffleRosters: false,
				startingSeasonFromInput: String(STARTING_SEASON),
				teamsFromInput: helpers.addPopRank(clubs),
				tid: 0,
			});

			await phase.newPhase(PHASE.REGULAR_SEASON, {});
		},
		5 * 60 * 1000,
	);

	afterAll(async () => {
		if (g.get("lid") !== undefined) {
			await league.remove(g.get("lid"));
		}
		await idb.meta.close();
		await deleteDB("meta");
	});

	test("England and Spain each have two Divisions of 16 clubs", async () => {
		const structure = competition.getCompetitionStructure();
		assert.deepStrictEqual(
			structure.countries.map((country) => country.name),
			["England", "Spain"],
		);

		const teams = await idb.cache.teams.getAll();
		assert.strictEqual(teams.length, 4 * PILOT_CLUBS_PER_DIVISION);
		for (const division of structure.competitionDivisions) {
			assert.strictEqual(
				teams.filter((t) => t.divisionId === division.divisionId).length,
				PILOT_CLUBS_PER_DIVISION,
				division.name,
			);
		}
	});

	test("the first season is a double round robin in each Division", async () => {
		assert.strictEqual(g.get("season"), STARTING_SEASON);
		assert.strictEqual(g.get("phase"), PHASE.REGULAR_SEASON);

		const divisionIdByTid = new Map(
			(await idb.cache.teams.getAll()).map((t) => [t.tid, t.divisionId]),
		);

		const gamesByTid = new Map<number, number>();
		const meetings = new Map<string, number>();
		for (const game of await season.getSchedule()) {
			const { homeTid, awayTid } = game;

			// Not a game between clubs, like the trade deadline
			if (homeTid < 0 || awayTid < 0) {
				continue;
			}

			assert.strictEqual(
				divisionIdByTid.get(homeTid),
				divisionIdByTid.get(awayTid),
				`tid ${homeTid} plays tid ${awayTid}`,
			);
			for (const tid of [homeTid, awayTid]) {
				gamesByTid.set(tid, (gamesByTid.get(tid) ?? 0) + 1);
			}
			const key = `${homeTid}-${awayTid}`;
			meetings.set(key, (meetings.get(key) ?? 0) + 1);
		}

		for (const tid of divisionIdByTid.keys()) {
			assert.strictEqual(gamesByTid.get(tid), 30, `tid ${tid}`);
		}

		// Every club is at home against every other club in its Division once
		assert.strictEqual(
			meetings.size,
			4 * PILOT_CLUBS_PER_DIVISION * (PILOT_CLUBS_PER_DIVISION - 1),
		);
		for (const count of meetings.values()) {
			assert.strictEqual(count, 1);
		}
	});

	test("every club has a youth academy", async () => {
		for (const t of await idb.cache.teams.getAll()) {
			const academyPlayers = await competition.getAcademyPlayers(t.tid);
			assert(academyPlayers.length > 0, `tid ${t.tid}`);
		}
	});
});
