import { MAX_LEVEL } from "../../../common/budgetLevels.ts";

/**
 * International Soccer Zen GM mod (Epic 8): money that depends on where a club
 * plays in its Country's pyramid, so reaching a higher tier pays, like real
 * soccer. Each Division has a national TV deal shared equally by its clubs,
 * worth more in higher tiers, and Division champions and promoted clubs get
 * prize money. The long run (src/test/worldLongRun.test.ts) can override these
 * settings, to tune them against real promotion survival rates.
 */
export const WORLD_REVENUE_SETTINGS = {
	// A club's national TV revenue as a multiple of ZenGM's, by tier (1 is the
	// top). The last applies to any lower tier.
	// Tuned in 10-season long runs: a top-tier deal big enough that a promoted
	// club can pay close to what the rest of its new Division pays
	tvShareByTier: [4, 0.6, 0.4],

	// Prize money for winning a Division, as a fraction of the salary cap,
	// scaled by the Division's TV share
	championPrize: 0.25,

	// Prize money for being promoted, as a fraction of the salary cap, scaled
	// by the TV share of the Division the club was promoted from, so winning a
	// Division always pays more than being promoted from it
	promotionPrize: 0.15,

	// Decided: each summer a club's hype moves this fraction of the way back to
	// the average, so fans' excitement fades after good or bad seasons instead
	// of drifting apart by tier
	hypeRegression: 0.25,

	// Decided: a club with more cash than a season's revenue reinvests it,
	// raising its coaching, facilities, and health budgets above its market
	// size's by this many levels (out of MAX_LEVEL) for each season's revenue of
	// spare cash, counting up to maxReinvestSeasons of it
	reinvestLevelsPerSeason: 20,
	maxReinvestSeasons: 3,

	// AI clubs put some cash above one season's revenue into their academy,
	// training ground, medical setup, and stadium each summer. This is an
	// up-front capital investment, separate from the operating expenses those
	// budget levels produce during the season.
	capitalInvestmentRate: 0.25,
	maxCapitalInvestmentSeasons: 1,
};

/** Cash an AI club reinvests in infrastructure in the preseason. */
export const getCapitalInvestment = ({
	cash,
	revenue,
}: {
	cash: number;
	revenue: number;
}) => {
	if (revenue <= 0 || cash <= revenue) {
		return 0;
	}
	return Math.round(
		Math.min(
			WORLD_REVENUE_SETTINGS.maxCapitalInvestmentSeasons * revenue,
			WORLD_REVENUE_SETTINGS.capitalInvestmentRate * (cash - revenue),
		),
	);
};

/** A club's national TV revenue as a multiple of ZenGM's, for its tier */
export const getTvShare = (tier: number) => {
	const shares = WORLD_REVENUE_SETTINGS.tvShareByTier;
	return shares[Math.max(0, Math.min(tier, shares.length) - 1)]!;
};

/** Prize money for winning a Division in `tier`, in thousands of dollars */
export const getChampionPrize = ({
	tier,
	salaryCap,
}: {
	tier: number;
	salaryCap: number;
}) =>
	Math.round(
		WORLD_REVENUE_SETTINGS.championPrize * getTvShare(tier) * salaryCap,
	);

/**
 * Prize money for being promoted from a Division in `tier`, in thousands of
 * dollars
 */
export const getPromotionPrize = ({
	tier,
	salaryCap,
}: {
	tier: number;
	salaryCap: number;
}) =>
	Math.round(
		WORLD_REVENUE_SETTINGS.promotionPrize * getTvShare(tier) * salaryCap,
	);

/**
 * A club's revenue last season with its national TV money swapped for what it
 * gets in the tier it plays in now, for setting its wage budget, so a promoted
 * club budgets for its new TV deal and a relegated club for its smaller one
 */
export const AVERAGE_HYPE = 0.5;

/** A club's hype after a summer's pull back to average (see hypeRegression) */
export const regressHype = (hype: number) =>
	hype + WORLD_REVENUE_SETTINGS.hypeRegression * (AVERAGE_HYPE - hype);

/**
 * The level a club's coaching, facilities, or health budget goes to in the
 * preseason: `level` for its market size, raised if last season left it with
 * more `cash` than that season's `revenue` (see reinvestLevelsPerSeason)
 */
export const getReinvestedBudgetLevel = ({
	level,
	cash,
	revenue,
}: {
	level: number;
	cash: number;
	revenue: number;
}) => {
	if (revenue <= 0 || cash <= revenue) {
		return level;
	}

	const spareSeasons = Math.min(
		(cash - revenue) / revenue,
		WORLD_REVENUE_SETTINGS.maxReinvestSeasons,
	);
	return Math.min(
		MAX_LEVEL,
		Math.round(
			level + WORLD_REVENUE_SETTINGS.reinvestLevelsPerSeason * spareSeasons,
		),
	);
};

export const getProjectedRevenue = ({
	revenue,
	nationalTv,
	lastTier,
	tier,
}: {
	revenue: number;
	nationalTv: number;
	lastTier: number;
	tier: number;
}) =>
	revenue - nationalTv + (nationalTv * getTvShare(tier)) / getTvShare(lastTier);
