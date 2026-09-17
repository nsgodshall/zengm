import { PHASE } from "../../../common/constants.ts";
import { bySport } from "../../../common/sportFunctions.ts";
import type { GameAttributesLeague, Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	addWorldHistoryEntry,
	buildWorldSeasonRecords,
	getClubSeasonLeaders,
	toWorldHistoryEntry,
} from "./clubSeasonRecords.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getWorldSeasonSummary } from "./seasonSummary.ts";

// A club's top scorer counts the same stat as its Division's Top Scorer award
// (see getDivisionAwards). Stats rows are season totals.
const getScore = bySport<(row: Record<string, number>) => number>({
	baseball: (row) => row.hr ?? 0,
	basketball: (row) => row.pts ?? 0,
	football: (row) => (row.rusTD ?? 0) + (row.recTD ?? 0),
	hockey: (row) => row.g ?? 0,
});

/**
 * International Soccer Zen GM mod (storytelling): save how every World club's
 * season went, once its regular season and promotion playoffs are over and
 * clubs have moved for next season. Each club's team season gets its full
 * record (when that team season is still in the cache), and the club itself
 * gets a short entry in its history, which survives deleting old team history.
 * Recording a season again replaces what was saved for it.
 */
export const recordWorldSeason = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teamSeasons = await idb.getCopies.teamSeasons(
		{ season },
		"noCopyCache",
	);
	const summary = await getWorldSeasonSummary(season);
	if (teamSeasons.length === 0 || !summary) {
		return;
	}

	const cachedTeamSeasons = [];
	for (const { tid } of teamSeasons) {
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, tid],
		);
		if (teamSeason) {
			cachedTeamSeasons.push(teamSeason);
		}
	}

	// Leaders are only kept in full records. At the end of a season everyone who
	// played is still in the cache; an earlier season needs retired players too.
	let leadersByTid;
	if (cachedTeamSeasons.length > 0) {
		const players: Player[] =
			season === g.get("season")
				? await idb.cache.players.getAll()
				: await idb.getCopies.players({ activeSeason: season }, "noCopyCache");
		leadersByTid = getClubSeasonLeaders({ players, season, getScore });
	}

	const records = buildWorldSeasonRecords({
		structure,
		tables: await getDivisionTables(season),
		summary,
		playoffGames: (
			(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffResults ??
			[]
		).filter((game) => game.season === season),
		teamSeasons,
		leadersByTid,
	});

	for (const teamSeason of cachedTeamSeasons) {
		const record = records.get(teamSeason.tid);
		if (record) {
			teamSeason.worldSeason = record;
			await idb.cache.teamSeasons.put(teamSeason);
		}
	}

	for (const t of await idb.cache.teams.getAll()) {
		const record = records.get(t.tid);
		if (record) {
			t.worldHistory = addWorldHistoryEntry(
				t.worldHistory,
				toWorldHistoryEntry(season, record),
			);
			await idb.cache.teams.put(t);
		}
	}
};

/**
 * International Soccer Zen GM mod (storytelling): a World made before season
 * records gets every finished season it still has team seasons for recorded,
 * once, when it loads. A season whose promotion playoffs aren't over yet is
 * recorded when it ends.
 */
export const fillWorldSeasonRecords = async () => {
	const structure = getCompetitionStructure();
	if (
		isSingleDivision(structure) ||
		(g as unknown as Partial<GameAttributesLeague>).worldSeasonRecordsFilled
	) {
		return;
	}

	const lastFinishedSeason =
		g.get("phase") > PHASE.PLAYOFFS ? g.get("season") : g.get("season") - 1;
	for (
		let season = g.get("startingSeason");
		season <= lastFinishedSeason;
		season++
	) {
		await recordWorldSeason(season);
	}

	await idb.cache.gameAttributes.put({
		key: "worldSeasonRecordsFilled",
		value: true,
	});
	g.setWithoutSavingToDB("worldSeasonRecordsFilled", true);
};
