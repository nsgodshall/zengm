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
