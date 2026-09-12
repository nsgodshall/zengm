import { WEBSITE_ROOT } from "../../../common/constants.ts";
import type { Conditions } from "../../../common/types.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { getRealSchedule } from "./getRealSchedule.football.ts";
import newScheduleGood from "./newScheduleGood.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import { orderBy } from "../../../common/utils.ts";
import {
	getDivisionIdForNewClub,
	isSingleDivision,
} from "../competition/competitionStructure.ts";
import { getCompetitionStructure } from "../competition/ensureCompetitionStructure.ts";
import { newWorldSchedule } from "../competition/worldSchedule.ts";

type ScheduleTeam = {
	seasonAttrs: {
		cid: number;
		did: number;
		divisionId?: number;
	};
	tid: number;
};

/**
 * International Soccer Zen GM mod (Epic 2): in a World with more than one
 * Division, each Division plays a round robin among only its own clubs, all on
 * one shared calendar (see competition/worldSchedule.ts), and numGamesDiv and
 * numGamesConf don't apply. Returns the same flat [home, away] list as the
 * normal schedule, with the trade deadline and All-Star Game inserted between
 * days rather than in the middle of one.
 */
const newScheduleWorld = (teams: ScheduleTeam[]) => {
	const structure = getCompetitionStructure();

	const days = newWorldSchedule(
		teams.map((t) => ({
			tid: t.tid,
			divisionId:
				t.seasonAttrs.divisionId ??
				getDivisionIdForNewClub(structure, t.seasonAttrs),
		})),
		structure,
		{ numGames: g.get("numGames") },
	);

	const specialDays: { fraction: number; matchup: [number, number] }[] = [];
	const tradeDeadline = g.get("tradeDeadline");
	if (tradeDeadline < 1) {
		specialDays.push({ fraction: tradeDeadline, matchup: [-3, -3] });
	}
	const allStarGame = g.get("allStarGame");
	if (allStarGame !== null && allStarGame >= 0) {
		specialDays.push({ fraction: allStarGame, matchup: [-1, -2] });
	}

	// Latest first, so inserting one doesn't shift where the next one goes
	const daysWithSpecialDays: [number, number][][] = [...days];
	for (const { fraction, matchup } of orderBy(
		specialDays,
		"fraction",
		"desc",
	)) {
		daysWithSpecialDays.splice(Math.round(fraction * days.length), 0, [
			matchup,
		]);
	}

	return daysWithSpecialDays.flat();
};

const newSchedule = async (teams: ScheduleTeam[], conditions?: Conditions) => {
	if (!isSingleDivision(getCompetitionStructure())) {
		return newScheduleWorld(teams);
	}

	if (isSport("football")) {
		const tids = await getRealSchedule(teams);
		if (tids) {
			return tids;
		}
	}

	const { tids, warning } = newScheduleGood(teams);

	// Add trade deadline
	const tradeDeadline = g.get("tradeDeadline");
	if (tradeDeadline < 1) {
		const ind = Math.round(tradeDeadline * tids.length);
		tids.splice(ind, 0, [-3, -3]);
	}

	// Add an All-Star Game
	const allStarGame = g.get("allStarGame");
	if (allStarGame !== null && allStarGame >= 0) {
		const ind = Math.round(allStarGame * tids.length);
		tids.splice(ind, 0, [-1, -2]);
	}

	if (warning !== undefined) {
		// console.log(g.get("season"), warning);
		logEvent(
			{
				type: "info",
				text: `Your <a href="${helpers.leagueUrl([
					"settings",
				])}">schedule settings (# Games, # Division Games, and # Conference Games)</a> combined with your teams/divs/confs cannot be handled by the schedule generator, so instead it will generate round robin matchups between all your teams. Message from the schedule generator: "${warning}" <a href="https://${WEBSITE_ROOT}/manual/customization/schedule-settings/" target="_blank">More details.</a>`,
				saveToDb: false,
			},
			conditions,
		);
	}

	return tids;
};

export default newSchedule;
