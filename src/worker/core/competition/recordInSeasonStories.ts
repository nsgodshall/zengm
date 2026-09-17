import { PHASE } from "../../../common/constants.ts";
import type {
	Conditions,
	GameAttributesLeague,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, logEvent } from "../../util/index.ts";
import { league } from "../index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	detectInSeasonStories,
	getEmptyInSeasonStoryState,
	writeInSeasonStory,
} from "./inSeasonStories.ts";
import { getStoryScore } from "./recordWorldStories.ts";
import teamLink from "./teamLink.ts";

/**
 * International Soccer Zen GM mod (storytelling): after a day of a World's
 * regular season, tell anything newly settled and any long runs (see
 * competition/inSeasonStories.ts) as "story" news
 */
export const recordInSeasonStories = async (conditions?: Conditions) => {
	const structure = getCompetitionStructure();
	const phase = g.get("phase");
	if (
		isSingleDivision(structure) ||
		(phase !== PHASE.REGULAR_SEASON && phase !== PHASE.AFTER_TRADE_DEADLINE)
	) {
		return;
	}

	const season = g.get("season");
	const saved = (g as unknown as Partial<GameAttributesLeague>)
		.worldInSeasonStoryState;
	const state =
		saved?.season === season ? saved : getEmptyInSeasonStoryState(season);

	const tables = await getDivisionTables(season);
	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[season], [season, "Z"]],
	);
	const runsByTid = new Map(
		teamSeasons.map((teamSeason) => [teamSeason.tid, teamSeason.worldRuns]),
	);

	const { stories, state: next } = detectInSeasonStories({
		state,
		divisions: structure.competitionDivisions.map((division) => ({
			divisionId: division.divisionId,
			tier: division.tier,
			numGames: division.numGames ?? g.get("numGames"),
			winPoints: division.winPoints ?? 3,
			rows: (tables[division.divisionId] ?? []).map((row) => ({
				tid: row.tid,
				points: row.points,
				played: row.won + row.lost + row.tied,
				winning: runsByTid.get(row.tid)?.winning ?? 0,
				losing: runsByTid.get(row.tid)?.losing ?? 0,
			})),
		})),
		links: structure.promotionRelegationLinks,
	});

	if (JSON.stringify(next) === JSON.stringify(saved)) {
		return;
	}

	const userTid = g.get("userTid");
	const userDivisionId = (await idb.cache.teams.get(userTid))?.divisionId;
	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const userCountryId =
		userDivisionId === undefined
			? undefined
			: countryIdByDivisionId.get(userDivisionId);

	for (const story of stories) {
		const division = structure.competitionDivisions.find(
			(other) => other.divisionId === story.divisionId,
		)!;
		const countryId = division.countryId;
		await logEvent(
			{
				type: "story",
				text: writeInSeasonStory(
					story,
					`The ${teamLink(story.tid)}`,
					division.name,
				),
				tids: [story.tid],
				score: getStoryScore(
					{ countryId, significance: story.significance },
					userCountryId,
				),
				showNotification: story.tid === userTid,
				hideInLiveGame: true,
				story: {
					kind: story.kind,
					countryId,
					divisionId: story.divisionId,
					significance: story.significance,
					facts: story.facts,
				},
			},
			conditions,
		);
	}

	await league.setGameAttributes({ worldInSeasonStoryState: next });
};
