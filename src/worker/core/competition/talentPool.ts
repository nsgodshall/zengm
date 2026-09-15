import { PHASE } from "../../../common/constants.ts";
import type { Phase } from "../../../common/types.ts";
import type { TransferWindow } from "./transferMarket.ts";

// International Soccer Zen GM mod (Epic 4): an international talent pool.
// While a transfer window is open, players from nations without a league in the
// World are available for any club to sign for a fee, and those nobody signs
// leave when the window closes.

// Decided: each window brings this many pool players for every club in the
// World
export const TALENT_POOL_PLAYERS_PER_CLUB = 0.5;

// Pool players are this old, from young players looking for a move to players
// in their prime
export const TALENT_POOL_MIN_AGE = 19;
export const TALENT_POOL_MAX_AGE = 29;

// A pool player's fee buys out this many seasons of his market wage from his
// club abroad (see getTransferFee), less than a World club asks, since he's
// moving to a bigger league
export const TALENT_POOL_FEE_SEASONS = 1;

export const getTalentPoolSize = (numClubs: number) =>
	Math.round(TALENT_POOL_PLAYERS_PER_CLUB * numClubs);

/**
 * Which window a pool belongs to, so its players are only around while that
 * window is open. The summer window carries on into the preseason, when the
 * season has already moved on, so it goes by the season it leads into.
 */
export const getTalentPoolKey = ({
	season,
	phase,
	window,
}: {
	season: number;
	phase: Phase;
	window: TransferWindow;
}) =>
	window === "winter"
		? `${season}-winter`
		: `${phase === PHASE.PRESEASON ? season : season + 1}-summer`;

/**
 * Picks a nation for a pool player from ZenGM's name data, whose `frequencies`
 * are cumulative weights (like playerBioInfo.frequencies), leaving out the
 * nations in `excluded`: the World's Countries. Undefined if there are no others.
 */
export const pickTalentPoolCountry = (
	frequencies: readonly (readonly [string, number])[],
	excluded: ReadonlySet<string>,
	random = Math.random,
) => {
	const weights: [string, number][] = [];
	let prev = 0;
	for (const [country, cumsum] of frequencies) {
		const weight = cumsum - prev;
		prev = cumsum;
		if (weight > 0 && !excluded.has(country)) {
			weights.push([country, weight]);
		}
	}

	const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
	if (total <= 0) {
		return;
	}

	let remaining = random() * total;
	for (const [country, weight] of weights) {
		remaining -= weight;
		if (remaining < 0) {
			return country;
		}
	}
	return weights.at(-1)![0];
};
