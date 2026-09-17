import { assert, beforeEach, test } from "vitest";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import {
	type CompetitionStructure,
	DEFAULT_DIVISION_ID,
	getDefaultCompetitionStructure,
} from "./competitionStructure.ts";
import ensureCompetitionStructure from "./ensureCompetitionStructure.ts";

beforeEach(() => {
	resetG();
	for (const key of [
		"countries",
		"competitionDivisions",
		"promotionRelegationLinks",
	]) {
		delete (g as any)[key];
	}
});

test("an old save gets the default structure, and its teams and cached team seasons go in its Division", async () => {
	await resetCache({
		teams: [
			{ tid: 0, cid: 0, did: 0 },
			{ tid: 1, cid: 1, did: 4 },
		],
		teamSeasons: [
			{ tid: 0, cid: 0, did: 0, season: 2015 },
			{ tid: 1, cid: 1, did: 4, season: 2016 },
		],
	});

	await ensureCompetitionStructure();

	const structure = getDefaultCompetitionStructure();
	assert.deepStrictEqual(g.get("countries"), structure.countries);
	assert.deepStrictEqual(
		g.get("competitionDivisions"),
		structure.competitionDivisions,
	);
	assert.deepStrictEqual(g.get("promotionRelegationLinks"), []);

	// Saved, not just set in memory
	assert.deepStrictEqual(
		(await idb.cache.gameAttributes.get("competitionDivisions"))?.value,
		structure.competitionDivisions,
	);

	const teams = await idb.cache.teams.getAll();
	assert.deepStrictEqual(
		teams.map((t) => t.divisionId),
		[DEFAULT_DIVISION_ID, DEFAULT_DIVISION_ID],
	);

	const teamSeasons = await idb.cache.teamSeasons.getAll();
	assert.deepStrictEqual(
		teamSeasons.map((teamSeason) => teamSeason.divisionId),
		[DEFAULT_DIVISION_ID, DEFAULT_DIVISION_ID],
	);
});

test("in a multi-Division World, only fills in what's missing, using each row's own did", async () => {
	// Mirrored as did 0 = A1, did 1 = A2, did 2 = B1
	const structure: CompetitionStructure = {
		countries: [
			{ countryId: 0, name: "A" },
			{ countryId: 1, name: "B" },
		],
		competitionDivisions: [
			{ divisionId: 5, countryId: 0, tier: 1, name: "A1" },
			{ divisionId: 6, countryId: 0, tier: 2, name: "A2" },
			{ divisionId: 7, countryId: 1, tier: 1, name: "B1" },
		],
		promotionRelegationLinks: [],
	};
	g.setWithoutSavingToDB("countries", structure.countries);
	g.setWithoutSavingToDB(
		"competitionDivisions",
		structure.competitionDivisions,
	);
	g.setWithoutSavingToDB("promotionRelegationLinks", []);
	// Already has crests, rosters, stadiums, season records, record fees, and
	// real clubs' history, which this test isn't about
	g.setWithoutSavingToDB("worldContentFilled", true);
	g.setWithoutSavingToDB("worldSeasonRecordsFilled", true);
	g.setWithoutSavingToDB("worldTransferRecordsFilled", true);
	g.setWithoutSavingToDB("worldRealClubHistoryFilled", true);
	g.setWithoutSavingToDB("worldStoriesFilled", true);

	await resetCache({
		teams: [
			{ tid: 0, cid: 0, did: 1, divisionId: 5 },
			{ tid: 1, cid: 0, did: 1 },
			{ tid: 2, cid: 1, did: 2 },
		],
		teamSeasons: [
			// Club 1 is in A2 now, but was in A1 this season
			{ tid: 1, cid: 0, did: 0, season: 2015 },
			{ tid: 1, cid: 0, did: 1, season: 2016, divisionId: 6 },
		],
	});

	await ensureCompetitionStructure();

	const teams = await idb.cache.teams.getAll();
	assert.deepStrictEqual(
		teams.map((t) => [t.tid, t.divisionId]),
		[
			[0, 5], // already set, even though its did would say A2
			[1, 6],
			[2, 7],
		],
	);

	const teamSeasons = await idb.cache.teamSeasons.getAll();
	assert.deepStrictEqual(
		teamSeasons.map((teamSeason) => [teamSeason.season, teamSeason.divisionId]),
		[
			[2015, 5],
			[2016, 6],
		],
	);

	// The saved structure is left alone
	assert.strictEqual(
		await idb.cache.gameAttributes.get("competitionDivisions"),
		undefined,
	);
	assert.deepStrictEqual(
		g.get("competitionDivisions"),
		structure.competitionDivisions,
	);
});
