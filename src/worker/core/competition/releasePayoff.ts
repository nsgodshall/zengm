import { PHASE } from "../../../common/constants.ts";
import type { Phase, Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { season } from "../index.ts";

/**
 * International Soccer Zen GM mod (Epic 8): how much is left to pay on a
 * contract, in thousands of dollars: every season after this one, plus the
 * share of this season still to play, which is all of it before the regular
 * season and none once the playoffs are over.
 */
export const getContractPayoff = ({
	amount,
	exp,
	currentSeason,
	phase,
	numGamesRemaining,
	numGames,
}: {
	amount: number;
	exp: number;
	currentSeason: number;
	phase: Phase;
	numGamesRemaining: number;
	numGames: number;
}) => {
	let thisSeasonFraction;
	if (phase < PHASE.REGULAR_SEASON) {
		thisSeasonFraction = 1;
	} else if (phase >= PHASE.PLAYOFFS) {
		thisSeasonFraction = 0;
	} else {
		thisSeasonFraction =
			numGames > 0 ? Math.min(1, numGamesRemaining / numGames) : 0;
	}

	return Math.max(
		0,
		Math.round(amount * (exp - currentSeason + thisSeasonFraction)),
	);
};

/**
 * International Soccer Zen GM mod (Epic 8, decided): in a World, a club that
 * releases a player pays off the rest of his contract from its cash at once
 * (see getContractPayoff), counted as a salary expense, instead of carrying it
 * on its payroll until the contract ends. Returns the amount paid.
 */
export const payOffReleasedContract = async (p: Player) => {
	const currentSeason = g.get("season");
	const teamSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[currentSeason, p.tid],
	);
	if (!teamSeason) {
		return 0;
	}

	const phase = g.get("phase");
	let numGamesRemaining = 0;
	if (phase === PHASE.REGULAR_SEASON || phase === PHASE.AFTER_TRADE_DEADLINE) {
		for (const game of await season.getSchedule()) {
			if (game.homeTid === p.tid || game.awayTid === p.tid) {
				numGamesRemaining += 1;
			}
		}
	}

	const payoff = getContractPayoff({
		amount: p.contract.amount,
		exp: p.contract.exp,
		currentSeason,
		phase,
		numGamesRemaining,
		numGames: g.get("numGames"),
	});

	teamSeason.cash -= payoff;
	teamSeason.expenses.salary += payoff;
	await idb.cache.teamSeasons.put(teamSeason);

	return payoff;
};
