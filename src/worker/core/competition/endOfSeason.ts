import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import type { Conditions } from "../../../common/types.ts";
import {
	type CompetitionStructure,
	getLegacyConfsDivs,
	isSingleDivision,
} from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import planEndOfSeason, { type EndOfSeasonPlan } from "./planEndOfSeason.ts";
import playPromotionPlayoffGame from "./playPromotionPlayoffGame.ts";
import teamLink from "./teamLink.ts";

/**
 * A top-tier champion is its Country's champion, marked the same way as a
 * champion in a normal ZenGM league with no playoffs (playoffRoundsWon 0), so it
 * gets the championship award and shows in league history. Lower-tier champions
 * just get the news.
 */
const crownChampions = async (
	structure: CompetitionStructure,
	champions: EndOfSeasonPlan["champions"],
	conditions: Conditions,
) => {
	for (const { division, row } of champions) {
		const isTopTier = division.tier === 1;
		if (isTopTier) {
			const teamSeason = await idb.cache.teamSeasons.indexGet(
				"teamSeasonsByTidSeason",
				[row.tid, g.get("season")],
			);
			if (teamSeason) {
				teamSeason.playoffRoundsWon = 0;
				teamSeason.hype = helpers.bound(teamSeason.hype + 0.2, 0, 1);
				await idb.cache.teamSeasons.put(teamSeason);
			}
		}

		const country = structure.countries.find(
			(country) => country.countryId === division.countryId,
		);

		logEvent(
			{
				type: "playoffs",
				text: `The ${teamLink(row.tid)} finished top of ${division.name} with ${
					row.points
				} points${isTopTier ? ` and are ${country?.name} champions!` : "."}`,
				showNotification: row.tid === g.get("userTid"),
				hideInLiveGame: true,
				tids: [row.tid],
				score: isTopTier ? 20 : 10,
			},
			conditions,
		);
	}
};

/**
 * Only the team changes: this season's team season keeps the Division the club
 * actually played in, and newPhasePreseason copies next season's from the team.
 * cid/did follow the Division, since confs/divs mirror the structure.
 */
const applyMoves = async (
	structure: CompetitionStructure,
	{ moves, playoffWinnerTids }: EndOfSeasonPlan,
	conditions: Conditions,
) => {
	const { confDivByDivisionId } = getLegacyConfsDivs(structure);
	const divisionsById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);

	for (const move of moves) {
		const t = await idb.cache.teams.get(move.tid);
		if (!t) {
			throw new Error(`Team ${move.tid} not found`);
		}

		const { cid, did } = confDivByDivisionId.get(move.toDivisionId)!;
		t.divisionId = move.toDivisionId;
		t.cid = cid;
		t.did = did;
		await idb.cache.teams.put(t);

		const from = divisionsById.get(move.fromDivisionId)!;
		const to = divisionsById.get(move.toDivisionId)!;
		const promoted = to.tier < from.tier;

		let text;
		if (!promoted) {
			text = `The ${teamLink(move.tid)} were relegated from ${from.name} to ${to.name}.`;
		} else if (playoffWinnerTids.has(move.tid)) {
			text = `The ${teamLink(move.tid)} won the ${from.name} promotion playoff and were promoted to ${to.name}!`;
		} else {
			text = `The ${teamLink(move.tid)} were promoted from ${from.name} to ${to.name}!`;
		}

		logEvent(
			{
				type: promoted ? "promotion" : "relegation",
				text,
				showNotification: move.tid === g.get("userTid"),
				hideInLiveGame: true,
				tids: [move.tid],
				score: 20,
			},
			conditions,
		);
	}
};

/**
 * International Soccer Zen GM mod (Epic 3): end the season in a World with
 * more than one Division. Crowns each Division's champion from its table,
 * plays any promotion playoffs, and moves clubs up and down for next season
 * (see planEndOfSeason).
 *
 * Returns false and does nothing in a single-Division league, which ends its
 * season the normal ZenGM way.
 */
const doEndOfSeason = async (conditions: Conditions) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return false;
	}

	const tables = await getDivisionTables(g.get("season"));
	const plan = await planEndOfSeason(structure, tables, (homeTid, awayTid) =>
		playPromotionPlayoffGame(homeTid, awayTid, conditions),
	);

	await crownChampions(structure, plan.champions, conditions);
	await applyMoves(structure, plan, conditions);

	return true;
};

export default doEndOfSeason;
