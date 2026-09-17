// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 6b): what a World club's stature (see competition/clubStature.ts) does,
// decided with the user: bigger clubs keep more hype, earn more from
// merchandise and sponsors, and are where players want to play, so a few big
// clubs tend to stay on top of each Country, challenged once in a while. Each
// effect is neutral at `neutralStature` and bounded. The long run can override
// these settings.

export const STATURE_EFFECT_SETTINGS = {
	// The stature at which every effect is neutral, about a World's average
	neutralStature: 45,

	// Each summer, hype moves back toward a resting point from restingHypeMin
	// (stature 0) to restingHypeMax (stature 100), instead of 0.5 for everyone
	restingHypeMin: 0.3,
	restingHypeMax: 0.75,

	// Merchandise and sponsorship revenue change this much for each point of
	// stature from neutral, within these bounds
	commercialPerPoint: 0.015,
	commercialMin: 0.6,
	commercialMax: 1.8,

	// Free agents ask this much less for each point of stature above neutral
	// (and more below it), within these bounds
	wagePerPoint: 0.004,
	wageMin: 0.8,
	wageMax: 1.15,

	// A player's mood toward a club gains this much for each point of stature
	// above neutral, up to moodMax either way
	moodPerPoint: 1 / 25,
	moodMax: 2,

	// How much more often than a stature 0 club a stature 100 club gets to act
	// first in free agency each day
	signingOrderWeight: 3,
};

const fromNeutral = (stature: number) =>
	stature - STATURE_EFFECT_SETTINGS.neutralStature;

const bound = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const getRestingHype = (stature: number) => {
	const settings = STATURE_EFFECT_SETTINGS;
	return (
		settings.restingHypeMin +
		((settings.restingHypeMax - settings.restingHypeMin) *
			bound(stature, 0, 100)) /
			100
	);
};

export const getStatureCommercialMultiplier = (stature: number) => {
	const settings = STATURE_EFFECT_SETTINGS;
	return bound(
		1 + settings.commercialPerPoint * fromNeutral(stature),
		settings.commercialMin,
		settings.commercialMax,
	);
};

export const getStatureWageFactor = (stature: number) => {
	const settings = STATURE_EFFECT_SETTINGS;
	return bound(
		1 - settings.wagePerPoint * fromNeutral(stature),
		settings.wageMin,
		settings.wageMax,
	);
};

export const getStatureMoodComponent = (stature: number) => {
	const settings = STATURE_EFFECT_SETTINGS;
	return bound(
		settings.moodPerPoint * fromNeutral(stature),
		-settings.moodMax,
		settings.moodMax,
	);
};

/**
 * Items in a random order where bigger clubs tend to come first: each gets a
 * key of random ^ (1 / weight) (weighted random sampling without replacement),
 * with weight from 1 at stature 0 to signingOrderWeight at stature 100
 */
export const orderByStatureWeightedRandom = <T>(
	items: T[],
	getStature: (item: T) => number,
	random: () => number = Math.random,
) => {
	const settings = STATURE_EFFECT_SETTINGS;
	return items
		.map((item) => {
			const weight =
				1 +
				((settings.signingOrderWeight - 1) * bound(getStature(item), 0, 100)) /
					100;
			return { item, key: random() ** (1 / weight) };
		})
		.sort((a, b) => b.key - a.key)
		.map(({ item }) => item);
};
