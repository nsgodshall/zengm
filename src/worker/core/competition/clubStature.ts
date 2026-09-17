import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling): how big a World club is, from
// 0 to 100, built from its finishes over the years (fading with time) and its
// market size (see STORY_TELLING_PLAN.md, Phase 2). For now it only describes
// clubs; Phase 6b decides what it does.

export const STATURE_SETTINGS = {
	// A season's finish counts half as much after this many seasons
	halfLife: 12,
	// Legacy turns into up to this many points of stature, reaching about 63% of
	// them at legacyScale
	legacyMax: 70,
	legacyScale: 80,
	// Market size (population in millions) adds up to this many points, from
	// nothing at marketPopMin to all of them at marketPopMax, on a log scale
	marketMax: 30,
	marketPopMin: 0.5,
	marketPopMax: 15,
	// Legacy a club starts a World with, by its starting tier (the last one for
	// any lower tier): about the stature of a club that has always been there
	startingLegacyByTier: [40, 15, 5],
};

export type StatureSeed = { legacy: number; season: number };

/**
 * Legacy points for a season's finish. Always winning a top tier settles at
 * about 178 legacy, a top-half top-tier club at about 53, a second-tier club at
 * about 18, and a third-tier club at about 9.
 */
export const getSeasonLegacyPoints = (
	entry: Pick<WorldHistoryEntry, "tier" | "position" | "numClubs" | "champion">,
) => {
	if (entry.tier === 1) {
		if (entry.champion) {
			return 10;
		}
		if (entry.position === 2) {
			return 7;
		}
		if (entry.position <= 4) {
			return 5;
		}
		return entry.position <= entry.numClubs / 2 ? 3 : 2;
	}
	if (entry.tier === 2) {
		return entry.champion ? 1.5 : 1;
	}
	return entry.champion ? 0.75 : 0.5;
};

export const decayLegacy = (legacy: number, seasons: number) =>
	legacy * 0.5 ** (Math.max(0, seasons) / STATURE_SETTINGS.halfLife);

export const getStartingLegacy = (tier: number) => {
	const legacies = STATURE_SETTINGS.startingLegacyByTier;
	return legacies[Math.min(tier, legacies.length) - 1]!;
};

/** Stature from legacy and market size (population in millions) */
export const getStature = ({
	legacy,
	pop,
}: {
	legacy: number;
	pop: number;
}) => {
	const settings = STATURE_SETTINGS;
	const legacyScore =
		settings.legacyMax * (1 - Math.exp(-legacy / settings.legacyScale));
	const market =
		(Math.log(Math.max(pop, 1e-6)) - Math.log(settings.marketPopMin)) /
		(Math.log(settings.marketPopMax) - Math.log(settings.marketPopMin));
	const marketScore = settings.marketMax * Math.min(1, Math.max(0, market));
	return Math.round(Math.min(100, Math.max(0, legacyScore + marketScore)));
};

/**
 * A club's legacy just after each season in its history, oldest first, starting
 * from its seed: the legacy it had going into the seed's season
 */
export const getLegacyTimeline = (
	seed: StatureSeed,
	history: WorldHistoryEntry[],
) => {
	// The seed is the legacy going into its season, so that season doesn't fade it
	let legacy = seed.legacy;
	let lastSeason = seed.season;
	return [...history]
		.filter((entry) => entry.season >= seed.season)
		.sort((a, b) => a.season - b.season)
		.map((entry) => {
			legacy =
				decayLegacy(legacy, entry.season - lastSeason) +
				getSeasonLegacyPoints(entry);
			lastSeason = entry.season;
			return { season: entry.season, legacy };
		});
};

/** The seed for a club with no seed of its own yet */
export const getDefaultStatureSeed = ({
	history,
	tier,
	season,
}: {
	history: WorldHistoryEntry[];
	tier: number;
	season: number;
}): StatureSeed => {
	const first = [...history].sort((a, b) => a.season - b.season)[0];
	return first
		? { legacy: getStartingLegacy(first.tier), season: first.season }
		: { legacy: getStartingLegacy(tier), season };
};

export type StatureLabel =
	| "Giant"
	| "Big club"
	| "Established"
	| "Modest"
	| "Minnow"
	| "Sleeping giant"
	| "Yo-yo club"
	| "Rising"
	| "Fading";

export const STATURE_LABEL_SETTINGS = {
	giant: 75,
	bigClub: 60,
	established: 45,
	modest: 30,
	// A big club outside the top tier
	sleepingGiant: 60,
	// Stature up or down this much over this many seasons
	trend: 10,
	trendSeasons: 5,
	// Promotions and relegations each within this many seasons
	yoYoMoves: 3,
	yoYoSeasons: 10,
};

/**
 * What kind of club it is: a story (yo-yo, sleeping giant, rising, fading) when
 * its recent history has one, otherwise how big it is. `history` needs stature
 * on its entries for rising and fading.
 */
export const getStatureLabel = ({
	stature,
	tier,
	history,
}: {
	stature: number;
	tier: number;
	history: WorldHistoryEntry[];
}): StatureLabel => {
	const settings = STATURE_LABEL_SETTINGS;
	const sorted = [...history].sort((a, b) => a.season - b.season);
	const latest = sorted.at(-1);

	if (latest) {
		const recent = sorted.filter(
			(entry) => entry.season > latest.season - settings.yoYoSeasons,
		);
		const moves = (moved: "promoted" | "relegated") =>
			recent.filter((entry) => entry.moved === moved).length;
		if (
			moves("promoted") >= settings.yoYoMoves &&
			moves("relegated") >= settings.yoYoMoves
		) {
			return "Yo-yo club";
		}
	}

	if (stature >= settings.sleepingGiant && tier > 1) {
		return "Sleeping giant";
	}

	const before = latest
		? sorted.find(
				(entry) => entry.season === latest.season - settings.trendSeasons,
			)
		: undefined;
	if (before?.stature !== undefined) {
		if (stature - before.stature >= settings.trend) {
			return "Rising";
		}
		if (before.stature - stature >= settings.trend) {
			return "Fading";
		}
	}

	if (stature >= settings.giant) {
		return "Giant";
	}
	if (stature >= settings.bigClub) {
		return "Big club";
	}
	if (stature >= settings.established) {
		return "Established";
	}
	if (stature >= settings.modest) {
		return "Modest";
	}
	return "Minnow";
};

/**
 * A club's stature now and what kind of club that makes it, from its seed (or
 * the default one), its history, its tier, and its market size. History
 * entries saved before stature existed get theirs worked out with today's
 * market size.
 */
export const describeClubStature = ({
	seed,
	history,
	tier,
	pop,
	season,
}: {
	seed: StatureSeed | undefined;
	history: WorldHistoryEntry[];
	tier: number;
	pop: number;
	season: number;
}) => {
	const actualSeed = seed ?? getDefaultStatureSeed({ history, tier, season });
	const timeline = getLegacyTimeline(actualSeed, history);
	const legacyBySeason = new Map(
		timeline.map((row) => [row.season, row.legacy]),
	);
	const legacy = timeline.at(-1)?.legacy ?? actualSeed.legacy;
	const stature = getStature({ legacy, pop });
	const historyWithStature = history.map((entry) =>
		entry.stature !== undefined
			? entry
			: {
					...entry,
					stature: getStature({
						legacy: legacyBySeason.get(entry.season) ?? actualSeed.legacy,
						pop,
					}),
				},
	);
	return {
		stature,
		label: getStatureLabel({ stature, tier, history: historyWithStature }),
	};
};
