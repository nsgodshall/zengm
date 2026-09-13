import { PHASE } from "../../../common/constants.ts";
import type { Phase } from "../../../common/types.ts";

// How much of the regular season the winter window stays open, ending at the
// trade deadline
export const WINTER_WINDOW_LENGTH = 0.15;

// Where the winter window ends in a league with no trade deadline
const WINTER_WINDOW_END_WITHOUT_DEADLINE = 0.6;

export type TransferWindow = "summer" | "winter";

/**
 * Which transfer window is open, if any. Like real soccer, a World has two:
 *
 * - summer: from the end of the season through the preseason
 * - winter: a stretch of the regular season ending at the trade deadline,
 *   which ZenGM already enforces by moving to the after-trade-deadline phase
 *
 * `seasonProgress` is how far through the regular season schedule it is, from
 * 0 to 1 (see getSeasonProgress).
 */
export const getTransferWindow = ({
	phase,
	seasonProgress,
	tradeDeadline,
}: {
	phase: Phase;
	seasonProgress: number;
	tradeDeadline: number;
}): TransferWindow | undefined => {
	if (
		phase === PHASE.PRESEASON ||
		(phase >= PHASE.DRAFT_LOTTERY && phase <= PHASE.FREE_AGENCY)
	) {
		return "summer";
	}

	if (phase === PHASE.REGULAR_SEASON) {
		const end =
			tradeDeadline < 1 ? tradeDeadline : WINTER_WINDOW_END_WITHOUT_DEADLINE;
		const start = Math.max(0, end - WINTER_WINDOW_LENGTH);
		if (seasonProgress >= start && seasonProgress < end) {
			return "winter";
		}
	}

	return undefined;
};

/**
 * How far through the regular season schedule `today` is: 0 on the first day,
 * approaching 1 on the last. Schedule days start at 1.
 */
export const getSeasonProgress = (today: number, lastDay: number) => {
	if (lastDay <= 0) {
		return 0;
	}
	return Math.min(1, Math.max(0, (today - 1) / lastDay));
};

// Younger players cost more, since they have more good seasons ahead of them
const getAgeFactor = (age: number) => {
	if (age <= 21) {
		return 1.6;
	}
	if (age <= 24) {
		return 1.4;
	}
	if (age <= 27) {
		return 1.2;
	}
	if (age <= 30) {
		return 1;
	}
	if (age <= 32) {
		return 0.7;
	}
	return 0.4;
};

// Beyond this many seasons, a longer contract doesn't raise the fee any more
const MAX_SEASONS_VALUED = 4;

/**
 * The fee a club asks for a player, in thousands of dollars like contracts.
 *
 * `marketWage` is what the player would earn on a new contract (see
 * player.genContract), and `seasonsLeft` is how many seasons his contract has
 * left including the current one, if it's still going. Buying a player is
 * roughly buying his remaining seasons at market value, so the fee is the
 * market wage times the seasons left (up to MAX_SEASONS_VALUED), adjusted for
 * age. A player with no seasons left is out of contract and costs nothing.
 */
export const getTransferFee = ({
	marketWage,
	age,
	seasonsLeft,
}: {
	marketWage: number;
	age: number;
	seasonsLeft: number;
}) => {
	if (seasonsLeft <= 0 || marketWage <= 0) {
		return 0;
	}

	const fee =
		marketWage * Math.min(seasonsLeft, MAX_SEASONS_VALUED) * getAgeFactor(age);

	// Round to the nearest $50k
	return Math.round(fee / 50) * 50;
};

/**
 * A club's wage budget, in thousands of dollars: the league's salary cap scaled
 * by how the club's revenue compares to the league average, so richer clubs can
 * pay more. Before a club has a completed season, its market size (popRank, 1
 * is biggest) stands in for revenue. Kept between half and double the cap, so
 * no club is locked out of the market or unlimited.
 */
export const getWageBudget = ({
	salaryCap,
	revenue,
	averageRevenue,
	popRank,
	numTeams,
}: {
	salaryCap: number;
	revenue: number | undefined;
	averageRevenue: number;
	popRank: number;
	numTeams: number;
}) => {
	let ratio;
	if (revenue !== undefined && averageRevenue > 0) {
		ratio = revenue / averageRevenue;
	} else {
		// Biggest market 1.2x the cap, smallest 0.8x
		const marketSize = numTeams <= 1 ? 0.5 : (popRank - 1) / (numTeams - 1);
		ratio = 1.2 - 0.4 * marketSize;
	}

	return Math.round(
		salaryCap *
			Math.min(
				MAX_WAGE_BUDGET_CAP_MULTIPLE,
				Math.max(MIN_WAGE_BUDGET_CAP_MULTIPLE, ratio),
			),
	);
};

// Wage budgets stay between these multiples of the salary cap (see
// getWageBudget), so the upper one is also the most any club can pay in wages
export const MIN_WAGE_BUDGET_CAP_MULTIPLE = 0.5;
export const MAX_WAGE_BUDGET_CAP_MULTIPLE = 2;

/**
 * Whether a club can sign a player to a contract of `amount` without breaking
 * its board's wage budget. The exceptions are the same as ZenGM's soft cap: a
 * minimum contract is always allowed, and so is re-signing one of the club's
 * own players. Like the salary cap checks, amounts within $1k are close enough.
 */
export const canSignWithinWageBudget = ({
	payroll,
	amount,
	wageBudget,
	minContract,
	resigning,
}: {
	payroll: number;
	amount: number;
	wageBudget: number;
	minContract: number;
	resigning: boolean;
}) =>
	resigning || amount - 1 <= minContract || payroll + amount - 1 <= wageBudget;
