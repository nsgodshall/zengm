import { shuffle } from "../../../common/random.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";

// [homeTid, awayTid], same as the rest of the schedule code
export type Matchup = [number, number];

// Games that can all be played on the same day - no club appears twice
export type Round = Matchup[];

/**
 * One single round robin: every club plays every other club once, one game
 * per round. Uses the circle method, which also balances home and away: with
 * an even number of clubs everyone's home and away counts differ by at most 1,
 * and with an odd number (one club rests each round) they're exactly equal.
 * Home and away mostly alternate round to round, so no club has a long run of
 * either.
 */
export const getRoundRobinRounds = (tids: number[]): Round[] => {
	if (tids.length < 2) {
		return [];
	}

	// With an odd number of clubs, the fixed slot is a bye, and whoever is
	// paired with it rests that round
	const slots: (number | undefined)[] =
		tids.length % 2 === 1 ? [undefined, ...tids] : [...tids];
	const numSlots = slots.length;

	const rounds: Round[] = [];
	for (let roundIndex = 0; roundIndex < numSlots - 1; roundIndex++) {
		const round: Round = [];
		for (let i = 0; i < numSlots / 2; i++) {
			const top = slots[i];
			const bottom = slots[numSlots - 1 - i];
			if (top === undefined || bottom === undefined) {
				continue;
			}

			// Epic 8: a rotating club moves one slot along each round, so hosting
			// from even pair positions on the top row and odd ones on the bottom row
			// makes its games alternate home and away (with a break where it passes
			// the fixed club), and still gives it half its games at home. Hosting
			// from the whole top row gave clubs half a round robin at home in a
			// row. The fixed club alternates by round.
			const topIsHome = i === 0 ? roundIndex % 2 === 0 : i % 2 === 0;
			round.push(topIsHome ? [top, bottom] : [bottom, top]);
		}
		rounds.push(round);

		// Keep slot 0 fixed and rotate everyone else one slot along
		slots.splice(1, 0, slots.pop());
	}

	return rounds;
};

const flipRound = (round: Round): Round =>
	round.map(([homeTid, awayTid]) => [awayTid, homeTid]);

/**
 * All of one Division's rounds for a season of `numGames` games per club.
 *
 * A season is back-to-back round robins with home and away swapped each time,
 * so `numGames` of 2 × (clubs - 1) is the usual soccer double round robin,
 * where every pair meets once at each ground. Games left over after the last
 * full round robin come from the start of another one: with an even number of
 * clubs everyone still plays exactly `numGames`, but with an odd number the
 * clubs resting during those extra rounds end up a game short.
 *
 * Every round robin keeps the same order of rounds, which keeps home and away
 * alternating and means two clubs never meet in back-to-back rounds where one
 * round robin ends and the next begins. The fixtures vary season to season
 * because the clubs are shuffled into the round robin's slots.
 */
export const getDivisionRounds = (
	tids: number[],
	numGames: number,
): Round[] => {
	if (tids.length < 2 || numGames <= 0) {
		return [];
	}

	const shuffledTids = [...tids];
	shuffle(shuffledTids);
	const roundRobin = getRoundRobinRounds(shuffledTids);

	const gamesPerRoundRobin = tids.length - 1;
	const numFullRoundRobins = Math.floor(numGames / gamesPerRoundRobin);
	const numExtraGames = numGames % gamesPerRoundRobin;

	const rounds: Round[] = [];
	for (let i = 0; i <= numFullRoundRobins; i++) {
		const cycle =
			i % 2 === 0
				? [...roundRobin]
				: roundRobin.map((round) => flipRound(round));

		if (i < numFullRoundRobins) {
			rounds.push(...cycle);
		} else {
			rounds.push(...cycle.slice(0, numExtraGames));
		}
	}

	return rounds;
};

/**
 * Lay every Division's rounds out on one shared calendar, one entry per day.
 * The Division with the most rounds plays a round every day. Divisions with
 * fewer rounds are spread evenly over the same days, starting on the first day
 * and finishing on the last, so every Division's season runs concurrently.
 *
 * Within a day, the Divisions with the most rounds go first. The schedule is
 * saved as a flat list and addDaysToSchedule starts a new day whenever a club
 * repeats, so each day has to open with a game whose clubs also played the day
 * before - which the longest Division's clubs always did.
 */
export const mergeRoundsIntoDays = (roundsByDivision: Round[][]): Round[] => {
	const numDays = Math.max(
		0,
		...roundsByDivision.map((rounds) => rounds.length),
	);
	const days: Round[] = Array.from({ length: numDays }, () => []);

	// sort is stable, so Divisions with the same number of rounds keep their order
	const longestFirst = [...roundsByDivision].sort(
		(a, b) => b.length - a.length,
	);

	for (const rounds of longestFirst) {
		for (const [i, round] of rounds.entries()) {
			// Strictly increasing in i, since numDays >= rounds.length, so a
			// Division never has two rounds on the same day
			const day =
				rounds.length === 1
					? 0
					: Math.round((i * (numDays - 1)) / (rounds.length - 1));
			days[day]!.push(...round);
		}
	}

	return days;
};

/**
 * Hook for sport-specific pacing quirks (e.g. hockey back-to-backs), applied to
 * the finished calendar, so nothing above needs isSport checks. No sport needs
 * one yet.
 */
export type WorldSchedulePacing = (days: Round[]) => Round[];

/**
 * The regular season schedule for a whole World, one entry per day: every
 * Division plays a round robin among only its own clubs (see
 * getDivisionRounds), all on one shared calendar (see mergeRoundsIntoDays).
 * Each Division's season length is its own `numGames` if set, otherwise the
 * league-wide `numGames`.
 */
export const newWorldSchedule = (
	clubs: { tid: number; divisionId: number }[],
	structure: CompetitionStructure,
	{
		numGames,
		pacing,
	}: {
		numGames: number;
		pacing?: WorldSchedulePacing;
	},
): Round[] => {
	const tidsByDivisionId = new Map<number, number[]>(
		structure.competitionDivisions.map((division) => [division.divisionId, []]),
	);
	for (const club of clubs) {
		const tids = tidsByDivisionId.get(club.divisionId);
		if (!tids) {
			throw new Error(
				`Team ${club.tid} is in Division ${club.divisionId}, which doesn't exist`,
			);
		}
		tids.push(club.tid);
	}

	const roundsByDivision = structure.competitionDivisions.map((division) =>
		getDivisionRounds(
			tidsByDivisionId.get(division.divisionId)!,
			division.numGames ?? numGames,
		),
	);

	const days = mergeRoundsIntoDays(roundsByDivision);

	return pacing ? pacing(days) : days;
};
