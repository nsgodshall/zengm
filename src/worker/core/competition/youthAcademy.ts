import { levelToEffect } from "../../../common/budgetLevels.ts";
import { PHASE } from "../../../common/constants.ts";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import type { Phase, PlayerContract } from "../../../common/types.ts";
import { minBy } from "../../../common/utils.ts";

// Players join an academy this many years younger than the youngest age
// ZenGM's draft would take them
const YEARS_BEFORE_DRAFT_AGE = 3;

/**
 * The ages a club's academy covers, from ZenGM's draftAges setting. A player
 * joins at `intakeAge` and has to leave the academy in the summer of the
 * season he turns `graduationAge`, so an academy holds `numCohorts` yearly
 * intakes at a time. For basketball's default draftAges of 19-22, that's
 * 16 to 22, 6 intakes.
 */
export const getAcademyAges = (draftAges: [number, number]) => {
	const intakeAge = draftAges[0] - YEARS_BEFORE_DRAFT_AGE;
	const graduationAge = Math.max(draftAges[1], intakeAge + 1);
	return {
		intakeAge,
		graduationAge,
		numCohorts: graduationAge - intakeAge,
	};
};

/**
 * International Soccer Zen GM mod (Epic 8): whether an academy player develops
 * in the season he turns `age`. A new academy player gets the ratings ZenGM
 * gives a draft prospect at the first draft age, so he only develops once he's
 * older than that. Developing from his intake age on put every graduate years
 * ahead of a normal league's players, and ratings rose across the whole World
 * season after season.
 */
export const academyPlayerDevelops = (
	age: number,
	draftAges: [number, number],
) => age > draftAges[0];

/**
 * How many players join academies across the whole World each summer. Same as
 * the number of prospects in one of ZenGM's default draft classes, so the
 * World gets as many young players as a normal league does.
 */
export const getAcademyIntakeSize = (numClubs: number) =>
	Math.round((defaultGameAttributes.numDraftRounds * numClubs * 7) / 6);

/**
 * The seasons whose summer each academy intake graduates in, for filling a
 * World's academies from scratch. Once this season's summer academy step has
 * run (in the draft phase), the oldest intake graduates next season instead.
 */
export const getAcademyCohortSeasons = ({
	season,
	phase,
	numCohorts,
}: {
	season: number;
	phase: Phase;
	numCohorts: number;
}) => {
	const first = phase >= PHASE.DRAFT ? season + 1 : season;
	return Array.from({ length: numCohorts }, (_, i) => first + i);
};

// How much a club's academy strength drops for each tier below the top. The
// scouting budget's effect ranges from about -1.1 to 1.1.
export const ACADEMY_TIER_PENALTY = 0.5;

/**
 * How good a club's academy is: its scouting budget (the 3-season average
 * expense level, which in a World with no draft pays for the academy), less a
 * penalty for each tier below the top, so relegation hurts the academy too.
 */
export const getAcademyStrength = ({
	scoutingLevel,
	tier,
}: {
	scoutingLevel: number;
	tier: number;
}) => levelToEffect(scoutingLevel) - ACADEMY_TIER_PENALTY * (tier - 1);

// Each round of an intake, clubs pick in order of academy strength plus up to
// this much luck either way
export const ACADEMY_PICK_ORDER_LUCK = 0.75;

/**
 * Shares out one intake of prospects between clubs, returning the tid each
 * prospect joins, in the same order as `pots`. Every club gets the same number
 * (plus or minus one), and better academies get better prospects: in each
 * round, clubs take the best prospect left in order of academy strength plus
 * some luck.
 */
export const allocateAcademyProspects = ({
	pots,
	clubs,
	random = Math.random,
}: {
	pots: number[];
	clubs: {
		tid: number;
		strength: number;
	}[];
	random?: () => number;
}) => {
	const tids: number[] = Array.from({ length: pots.length });
	if (clubs.length === 0) {
		return tids;
	}

	const bestFirst = pots.map((pot, i) => ({ pot, i }));
	bestFirst.sort((a, b) => b.pot - a.pot);

	let next = 0;
	while (next < bestFirst.length) {
		const order = clubs.map((club) => ({
			tid: club.tid,
			score: club.strength + (2 * random() - 1) * ACADEMY_PICK_ORDER_LUCK,
		}));
		order.sort((a, b) => b.score - a.score);

		for (const { tid } of order) {
			const prospect = bestFirst[next];
			if (!prospect) {
				break;
			}
			tids[prospect.i] = tid;
			next += 1;
		}
	}

	return tids;
};

export type AcademyRosterPlayer = {
	// ZenGM's player value, which counts potential, heavily for young players
	value: number;
	// Player value from current ratings alone
	valueNoPot: number;
};

export type AcademyProspect = AcademyRosterPlayer & {
	pid: number;
	graduating: boolean;
};

/**
 * What a club does with its academy in the summer. `roster` is everyone on its
 * first team, including players whose contracts are about to expire, since the
 * club might still re-sign them.
 *
 * - An AI club promotes a younger prospect early only if, on current ratings,
 *   he'd already be one of its best `rotationSize` players. Promising players
 *   who aren't ready yet stay in the academy to develop.
 * - At graduation it's keep him or lose him. An AI club keeps a graduate worth
 *   more than its worst first-team player counting potential, or any graduate
 *   while it has fewer than `minRosterSize` players, and releases the rest to
 *   free agency.
 * - Promotions never fill a roster just because there's space: a club with a
 *   full roster can't buy anyone, all summer. Once a roster is over
 *   `maxRosterSize`, a promotion takes the place of the lowest value player,
 *   since that's who the AI releases (see team.checkRosterSizes), and a
 *   prospect who'd be that player himself isn't promoted.
 *
 * This is only for AI clubs. The user runs their own academy on the academy
 * page (see competition/academies.ts).
 */
export const planAcademyPromotions = ({
	prospects,
	roster,
	minRosterSize,
	maxRosterSize,
	rotationSize,
}: {
	prospects: AcademyProspect[];
	roster: AcademyRosterPlayer[];
	minRosterSize: number;
	maxRosterSize: number;
	rotationSize: number;
}) => {
	const promote: number[] = [];
	const release: number[] = [];

	const firstTeam = [...roster];

	const bestFirst = [...prospects].sort((a, b) => b.value - a.value);
	for (const prospect of bestFirst) {
		const lowestValue = minBy(firstTeam, "value");
		const beatsLowestValue =
			lowestValue !== undefined && prospect.value > lowestValue.value;

		let promoted;
		if (prospect.graduating) {
			promoted = firstTeam.length < minRosterSize || beatsLowestValue;
		} else {
			const bestNow = firstTeam.map((p) => p.valueNoPot).sort((a, b) => b - a);
			const rotationCutoff =
				bestNow[Math.min(rotationSize, bestNow.length) - 1];
			promoted =
				rotationCutoff !== undefined &&
				prospect.valueNoPot > rotationCutoff &&
				(firstTeam.length < maxRosterSize || beatsLowestValue);
		}

		if (promoted) {
			promote.push(prospect.pid);
			firstTeam.push(prospect);
			if (firstTeam.length > maxRosterSize && lowestValue) {
				firstTeam.splice(firstTeam.indexOf(lowestValue), 1);
			}
		} else if (prospect.graduating) {
			release.push(prospect.pid);
		}
	}

	return { promote, release };
};

// Seasons on an academy graduate's first contract
export const ACADEMY_CONTRACT_SEASONS = 3;

/**
 * An academy graduate's first contract: the minimum wage for
 * ACADEMY_CONTRACT_SEASONS seasons, counting from next season when he's
 * promoted after the regular season and playoffs, or from this season before.
 * It's a rookie contract, so the club can release him for free until the
 * regular season starts (see helpers.justDrafted).
 */
export const getAcademyContract = ({
	season,
	phase,
	minContract,
}: {
	season: number;
	phase: Phase;
	minContract: number;
}): PlayerContract => ({
	amount: minContract,
	exp: season + ACADEMY_CONTRACT_SEASONS - (phase > PHASE.PLAYOFFS ? 0 : 1),
	rookie: true,
});

/**
 * The draft year recorded for an academy graduate: the season he joins a
 * first team after, like a drafted player's.
 */
export const getAcademyDraftYear = (season: number, phase: Phase) =>
	phase > PHASE.PLAYOFFS ? season : season - 1;
