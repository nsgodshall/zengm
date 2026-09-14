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

/**
 * The schedule days the winter window is open, from `openDay` up to but not
 * including `closeDay`, for news about it. `lastDay` is the regular season's
 * last schedule day and `deadlineDay` the trade deadline's, if it has one,
 * since reaching the deadline ends the window even if getTransferWindow would
 * still have it open. Undefined if it never opens.
 */
export const getWinterWindowDays = ({
	lastDay,
	tradeDeadline,
	deadlineDay,
}: {
	lastDay: number;
	tradeDeadline: number;
	deadlineDay?: number;
}) => {
	const lastWindowDay = Math.min(lastDay, (deadlineDay ?? Infinity) - 1);

	let openDay;
	for (let day = 1; day <= lastWindowDay; day++) {
		const open =
			getTransferWindow({
				phase: PHASE.REGULAR_SEASON,
				seasonProgress: getSeasonProgress(day, lastDay),
				tradeDeadline,
			}) === "winter";
		if (open && openDay === undefined) {
			openDay = day;
		} else if (!open && openDay !== undefined) {
			return { openDay, closeDay: day };
		}
	}

	return openDay === undefined
		? undefined
		: { openDay, closeDay: lastWindowDay + 1 };
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

// A club in debt has its wage budget cut to pay the debt off over this many
// seasons
export const DEBT_REPAYMENT_SEASONS = 3;

// A club with cash to spare can spend this fraction of it on wages each season
export const SURPLUS_SPENDING_FRACTION = 0.2;

/**
 * A club's wage budget, in thousands of dollars.
 *
 * International Soccer Zen GM mod (Epic 8, decided): once a club has a
 * completed season, its board lets it spend on wages what last season's
 * `revenue` left after its `runningCosts` (coaching, facilities, health, and
 * scouting), so it breaks even. A club in debt (negative `cash`) has that cut
 * to pay the debt off over DEBT_REPAYMENT_SEASONS, and a club with cash to spare
 * can spend SURPLUS_SPENDING_FRACTION of it. Kept between `minWageBudget`,
 * enough to field a squad on minimum contracts, and double the salary cap.
 * Scaling the cap by revenue instead left most lower-tier clubs hundreds of
 * millions in debt within 10 seasons while big clubs piled up cash.
 *
 * Before a club has a completed season, its market size (popRank, 1 is
 * biggest) stands in for revenue, scaling the cap, and its budget also covers
 * its payroll when the World was created (`startingPayroll`), plus
 * STARTING_BUDGET_ROOM of the cap to sign someone, since starting rosters
 * aren't built to any budget.
 */
export const getWageBudget = ({
	salaryCap,
	revenue,
	runningCosts,
	cash,
	minWageBudget,
	popRank,
	numTeams,
	startingPayroll,
}: {
	salaryCap: number;
	revenue: number | undefined;
	runningCosts: number;
	cash: number;
	minWageBudget: number;
	popRank: number;
	numTeams: number;
	startingPayroll?: number;
}) => {
	if (revenue !== undefined) {
		const cashAdjustment =
			cash < 0
				? cash / DEBT_REPAYMENT_SEASONS
				: SURPLUS_SPENDING_FRACTION * cash;
		return Math.round(
			Math.min(
				MAX_WAGE_BUDGET_CAP_MULTIPLE * salaryCap,
				Math.max(minWageBudget, revenue - runningCosts + cashAdjustment),
			),
		);
	}

	const budget = getMarketSizeWageBudget({ salaryCap, popRank, numTeams });
	if (startingPayroll !== undefined) {
		return Math.max(
			budget,
			Math.round(startingPayroll + STARTING_BUDGET_ROOM * salaryCap),
		);
	}

	return budget;
};

// Room in a club's first-season budget beyond its starting payroll, as a
// fraction of the salary cap
export const STARTING_BUDGET_ROOM = 0.1;

// Before a club has a completed season: the biggest market gets 1.2x the cap,
// the smallest 0.8x
const getMarketSizeWageBudget = ({
	salaryCap,
	popRank,
	numTeams,
}: {
	salaryCap: number;
	popRank: number;
	numTeams: number;
}) => {
	const marketSize = numTeams <= 1 ? 0.5 : (popRank - 1) / (numTeams - 1);
	return Math.round(salaryCap * (1.2 - 0.4 * marketSize));
};

// Wage budgets are at most this multiple of the salary cap (see getWageBudget),
// so it's also the most any club can pay in wages
export const MAX_WAGE_BUDGET_CAP_MULTIPLE = 2;

/**
 * Whether a club can sign a player to a contract of `amount` without breaking
 * its board's wage budget. The exceptions are the same as ZenGM's soft cap: a
 * minimum contract is always allowed, and so is re-signing one of the club's
 * own players. Like the salary cap checks, amounts within $1k are close enough.
 */
/**
 * Seasons left on a player's contract, counting the current one while it's
 * still being played
 */
export const getContractSeasonsLeft = ({
	exp,
	season,
	phase,
}: {
	exp: number;
	season: number;
	phase: Phase;
}) => exp - season + (phase <= PHASE.PLAYOFFS ? 1 : 0);

// A club can spend into debt, down to this fraction of its wage budget
export const MAX_DEBT_FRACTION_OF_WAGE_BUDGET = 0.5;

/**
 * The most a club can pay in transfer fees: its cash, plus going into debt down
 * to MAX_DEBT_FRACTION_OF_WAGE_BUDGET of its wage budget. Thousands of dollars.
 */
export const getTransferFunds = ({
	cash,
	wageBudget,
}: {
	cash: number;
	wageBudget: number;
}) => Math.max(0, cash + MAX_DEBT_FRACTION_OF_WAGE_BUDGET * wageBudget);

/**
 * International Soccer Zen GM mod (Epic 8, decided): whether an AI club can pay
 * a transfer fee. AI clubs only spend cash they have, since debt cuts their
 * wage budgets (see getWageBudget).
 */
export const canAiAffordFee = ({ cash, fee }: { cash: number; fee: number }) =>
	fee <= cash;

/** Whether the user's club can pay a transfer fee (see getTransferFunds) */
export const canAffordFee = ({
	cash,
	fee,
	wageBudget,
}: {
	cash: number;
	fee: number;
	wageBudget: number;
}) => fee <= getTransferFunds({ cash, wageBudget });

// A club can do without a player if losing him costs it no more than this much
// value (the same scale as AI trades). It sells a player like that at his plain
// fee, and AI clubs only sell each other players like that.
export const SELLER_MAX_VALUE_LOSS = -5;

// For each point of value a club would lose beyond that, its asking price goes
// up by this fraction of the fee, to at most MAX_ASKING_PRICE_MULTIPLE times it
export const ASKING_PRICE_INCREASE_PER_VALUE = 0.1;
export const MAX_ASKING_PRICE_MULTIPLE = 3;

/**
 * What a club wants for one of its players, in thousands of dollars: his fee
 * (see getTransferFee), raised the more the club would miss him.
 * `sellerValueChange` is the change in the club's value without him, so a loss
 * is negative.
 */
export const getAskingPrice = ({
	fee,
	sellerValueChange,
}: {
	fee: number;
	sellerValueChange: number;
}) => {
	const valueLostBeyondExpendable = Math.max(
		0,
		SELLER_MAX_VALUE_LOSS - sellerValueChange,
	);
	const multiple = Math.min(
		MAX_ASKING_PRICE_MULTIPLE,
		1 + ASKING_PRICE_INCREASE_PER_VALUE * valueLostBeyondExpendable,
	);

	// Round to the nearest $50k
	return Math.round((fee * multiple) / 50) * 50;
};

// An offer below this fraction of the asking price is rejected without a
// counter-offer
export const MIN_COUNTERED_OFFER_FRACTION = 0.7;

export type TransferOfferResponse = "accept" | "counter" | "reject";

/**
 * How a selling club answers an offer: it accepts its asking price or more,
 * counters with its asking price when the offer is close, and rejects the rest
 */
export const respondToTransferOffer = ({
	offer,
	askingPrice,
}: {
	offer: number;
	askingPrice: number;
}): TransferOfferResponse => {
	if (offer >= askingPrice) {
		return "accept";
	}
	if (offer >= MIN_COUNTERED_OFFER_FRACTION * askingPrice) {
		return "counter";
	}
	return "reject";
};

// How many days an AI club's offer for one of the user's players stays open
export const TRANSFER_OFFER_DAYS = 3;

// A player on the user's transfer list is this many times as likely as one who
// isn't to draw an offer
export const TRANSFER_LISTED_OFFER_WEIGHT = 5;

/**
 * What an AI club offers for one of the user's players, in thousands of
 * dollars: somewhat below his fee (see getTransferFee) if the user has put him
 * on their transfer list, since they want to sell, and above it if they
 * haven't, to tempt them. `random` is uniform on [0, 1).
 */
export const getAiOfferFee = ({
	fee,
	listed,
	random = Math.random,
}: {
	fee: number;
	listed: boolean;
	random?: () => number;
}) => {
	const [min, max] = listed ? [0.75, 1] : [0.9, 1.2];

	// Round to the nearest $50k
	return Math.round((fee * (min + (max - min) * random())) / 50) * 50;
};

/**
 * Offers one day later: each has a day less to run, and those that have run
 * out are gone
 */
export const tickTransferOffers = <T extends { daysLeft: number }>(
	offers: T[],
) =>
	offers
		.map((offer) => ({ ...offer, daysLeft: offer.daysLeft - 1 }))
		.filter((offer) => offer.daysLeft > 0);

export const canSignWithinWageBudget = ({
	payroll,
	amount,
	wageBudget,
	minContract,
}: {
	payroll: number;
	amount: number;
	wageBudget: number;
	minContract: number;
}) => amount - 1 <= minContract || payroll + amount - 1 <= wageBudget;

// An academy player has no contract to buy out, so his fee is what his
// potential is worth: his market wage above the minimum (see
// player.genContract, whose value counts potential heavily for young players)
// for this many seasons
export const ACADEMY_FEE_SEASONS = 1;

/**
 * The fee for an academy player, in thousands of dollars. Never less than a
 * minimum contract, so no prospect comes free.
 */
export const getAcademyTransferFee = ({
	marketWage,
	minContract,
}: {
	marketWage: number;
	minContract: number;
}) => {
	const fee = Math.max(0, marketWage - minContract) * ACADEMY_FEE_SEASONS;

	// Round to the nearest $50k
	return Math.max(minContract, Math.round(fee / 50) * 50);
};

// A club asks this many times the fee for the most valuable player in its
// academy
export const BEST_ACADEMY_PLAYER_ASKING_PRICE_MULTIPLE = 2;

/** What a club wants for one of its academy players, in thousands of dollars */
export const getAcademyAskingPrice = ({
	fee,
	isBestInAcademy,
}: {
	fee: number;
	isBestInAcademy: boolean;
}) => (isBestInAcademy ? BEST_ACADEMY_PLAYER_ASKING_PRICE_MULTIPLE * fee : fee);

// An AI club only buys an academy player who'd be one of this many most
// valuable players in its academy
export const AI_ACADEMY_BUY_RANK = 3;

/**
 * Whether an AI club wants an academy player worth `value`, given the values of
 * the players already in its academy
 */
export const aiWantsAcademyPlayer = ({
	value,
	academyValues,
}: {
	value: number;
	academyValues: number[];
}) =>
	academyValues.filter((academyValue) => academyValue >= value).length <
	AI_ACADEMY_BUY_RANK;
