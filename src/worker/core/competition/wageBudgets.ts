import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { team } from "../index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	getWageBudget,
	MAX_WAGE_BUDGET_CAP_MULTIPLE,
} from "./transferMarket.ts";

/**
 * Every active club's wage budget, in thousands of dollars, from its revenue
 * in the last completed season (see getWageBudget). In a World this is the
 * board's limit that takes the place of ZenGM's league-wide salary cap.
 */
export const getWageBudgets = async () => {
	const currentSeason = g.get("season");
	const revenueSeason =
		g.get("phase") > PHASE.PLAYOFFS ? currentSeason : currentSeason - 1;

	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[revenueSeason], [revenueSeason, "Z"]],
	);
	const revenueByTid = new Map<number, number>();
	for (const teamSeason of teamSeasons) {
		let revenue = 0;
		for (const amount of Object.values(teamSeason.revenues)) {
			revenue += amount;
		}
		revenueByTid.set(teamSeason.tid, revenue);
	}
	const averageRevenue =
		revenueByTid.size > 0
			? [...revenueByTid.values()].reduce((sum, x) => sum + x, 0) /
				revenueByTid.size
			: 0;

	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	const popRanks = helpers.getPopRanks(teams);

	const wageBudgets = new Map<number, number>();
	for (const [i, t] of teams.entries()) {
		wageBudgets.set(
			t.tid,
			getWageBudget({
				salaryCap: g.get("salaryCap"),
				revenue: revenueByTid.get(t.tid),
				averageRevenue,
				popRank: popRanks[i] ?? teams.length,
				numTeams: teams.length,
				startingPayroll: t.startingPayroll,
			}),
		);
	}

	return wageBudgets;
};

/**
 * Records each club's payroll when a World is created, which its wage budget
 * covers until its first season is over (see getWageBudget)
 */
export const recordStartingPayrolls = async () => {
	for (const t of await idb.cache.teams.getAll()) {
		if (!t.disabled && t.startingPayroll === undefined) {
			t.startingPayroll = await team.getPayroll(t.tid);
			await idb.cache.teams.put(t);
		}
	}
};

/**
 * The highest contract a player can ask for or be offered. A World keeps the
 * minimum contract but has no maximum: wages are whatever the market pays, so
 * the only ceiling is the most any club could ever afford. Elsewhere it's
 * ZenGM's normal maxContract setting.
 *
 * This is only the upper bound on contract amounts. maxContract itself still
 * sets the scale of ZenGM's contract formula (player.genContract), so wages
 * don't inflate across the board.
 */
export const getMaxContract = () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return g.get("maxContract");
	}
	return MAX_WAGE_BUDGET_CAP_MULTIPLE * g.get("salaryCap");
};
