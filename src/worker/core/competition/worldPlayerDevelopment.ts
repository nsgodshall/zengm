import { DEFAULT_LEVEL, levelToEffect } from "../../../common/budgetLevels.ts";
import { helpers } from "../../../common/helpers.ts";

export type WorldDevelopmentArchetype =
	| "standard"
	| "early"
	| "late"
	| "stalled";

export type WorldDevelopmentPlan = {
	archetype: WorldDevelopmentArchetype;
	playingTimeShare: number;
	positiveFactor: number;
	negativeFactor: number;
	promiseFulfilled?: boolean;
};

const stablePercentile = (pid: number) => {
	let value = (pid + 1) | 0;
	value ^= value << 13;
	value ^= value >>> 17;
	value ^= value << 5;
	return (value >>> 0) % 100;
};

export const getWorldDevelopmentArchetype = (
	pid: number,
): WorldDevelopmentArchetype => {
	const percentile = stablePercentile(pid);
	if (percentile < 12) {
		return "early";
	}
	if (percentile < 24) {
		return "late";
	}
	if (percentile < 32) {
		return "stalled";
	}
	return "standard";
};

const getCurveFactor = (archetype: WorldDevelopmentArchetype, age: number) => {
	if (archetype === "early") {
		return age <= 21 ? 1.18 : age <= 24 ? 0.95 : 0.85;
	}
	if (archetype === "late") {
		return age <= 21 ? 0.72 : age <= 27 ? 1.25 : age <= 30 ? 1.05 : 1;
	}
	if (archetype === "stalled") {
		return age <= 27 ? 0.62 : 0.9;
	}
	return 1;
};

const promisedPlayingTime = {
	key: 0.7,
	starter: 0.5,
	rotation: 0.25,
} as const;

/**
 * Builds one transparent multiplier for a World player's next development
 * step. Playing regularly matters most, while higher competition, a productive
 * loan, and a fulfilled role promise make smaller differences. Training is
 * still handled by ZenGM's coaching level; medical infrastructure limits the
 * extra decline from an injury that remains at the end of the season.
 */
export const getWorldDevelopmentPlan = ({
	pid,
	age,
	gamesPlayed,
	teamGames,
	hasPlayingTimeData = true,
	tier = 1,
	numTiers = 1,
	onLoan = false,
	medicalLevel = DEFAULT_LEVEL,
	injuryGamesRemaining = 0,
	promisedRole,
}: {
	pid: number;
	age: number;
	gamesPlayed: number;
	teamGames: number;
	hasPlayingTimeData?: boolean;
	tier?: number;
	numTiers?: number;
	onLoan?: boolean;
	medicalLevel?: number;
	injuryGamesRemaining?: number;
	promisedRole?: keyof typeof promisedPlayingTime;
}): WorldDevelopmentPlan => {
	const archetype = getWorldDevelopmentArchetype(pid);
	const playingTimeShare =
		teamGames > 0 ? helpers.bound(gamesPlayed / teamGames, 0, 1) : 0;
	const playingTimeFactor = hasPlayingTimeData
		? 0.72 + 0.42 * Math.sqrt(playingTimeShare)
		: 1;
	const competitionFactor =
		numTiers <= 1 ? 1 : 0.97 + (0.06 * (numTiers - tier)) / (numTiers - 1);
	const loanFactor = onLoan
		? playingTimeShare >= 0.35
			? 1.08
			: playingTimeShare < 0.15
				? 0.93
				: 1
		: 1;
	const promiseFulfilled = promisedRole
		? playingTimeShare >= promisedPlayingTime[promisedRole]
		: undefined;
	const moraleFactor =
		promiseFulfilled === undefined ? 1 : promiseFulfilled ? 1.05 : 0.94;
	const injuryBurden =
		teamGames > 0 ? helpers.bound(injuryGamesRemaining / teamGames, 0, 1) : 0;
	const medicalProtection = 1 - 0.35 * Math.max(0, levelToEffect(medicalLevel));
	const injuryGrowthFactor = 1 - 0.2 * injuryBurden * medicalProtection;
	const positiveFactor = helpers.bound(
		getCurveFactor(archetype, age) *
			playingTimeFactor *
			competitionFactor *
			loanFactor *
			moraleFactor *
			injuryGrowthFactor,
		0.45,
		1.45,
	);
	const negativeFactor = 1 + 0.15 * injuryBurden * medicalProtection;

	return {
		archetype,
		playingTimeShare,
		positiveFactor,
		negativeFactor,
		promiseFulfilled,
	};
};
