import { describe, expect, test } from "vitest";
import { DEFAULT_LEVEL, MAX_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE } from "../../../common/constants.ts";
import {
	ACADEMY_TIER_PENALTY,
	academyPlayerDevelops,
	allocateAcademyProspects,
	getAcademyAges,
	getAcademyCohortSeasons,
	getAcademyContract,
	getAcademyDraftYear,
	getAcademyIntakeSize,
	getAcademyStrength,
	planAcademyPromotions,
} from "./youthAcademy.ts";

describe("getAcademyAges", () => {
	test("basketball's draft ages give an academy from 16 to 22, 6 intakes", () => {
		expect(getAcademyAges([19, 22])).toEqual({
			intakeAge: 16,
			graduationAge: 22,
			numCohorts: 6,
		});
	});

	test("an academy always holds at least one intake", () => {
		expect(getAcademyAges([22, 20])).toEqual({
			intakeAge: 19,
			graduationAge: 20,
			numCohorts: 1,
		});
	});
});

describe("academyPlayerDevelops", () => {
	test("only once he's older than the first draft age, like a draft prospect", () => {
		for (const age of [16, 17, 18, 19]) {
			expect(academyPlayerDevelops(age, [19, 22])).toBe(false);
		}
		for (const age of [20, 21, 22]) {
			expect(academyPlayerDevelops(age, [19, 22])).toBe(true);
		}
	});
});

describe("getAcademyIntakeSize", () => {
	test("the World gets as many young players a year as a default draft class", () => {
		expect(getAcademyIntakeSize(24)).toBe(56);
		expect(getAcademyIntakeSize(30)).toBe(70);
	});
});

describe("getAcademyCohortSeasons", () => {
	test("before the summer academy step, the oldest intake graduates this season", () => {
		for (const phase of [
			PHASE.PRESEASON,
			PHASE.REGULAR_SEASON,
			PHASE.PLAYOFFS,
			PHASE.DRAFT_LOTTERY,
		]) {
			expect(
				getAcademyCohortSeasons({ season: 2020, phase, numCohorts: 3 }),
			).toEqual([2020, 2021, 2022]);
		}
	});

	test("from the draft phase on, it graduates next season", () => {
		for (const phase of [
			PHASE.DRAFT,
			PHASE.AFTER_DRAFT,
			PHASE.RESIGN_PLAYERS,
			PHASE.FREE_AGENCY,
		]) {
			expect(
				getAcademyCohortSeasons({ season: 2020, phase, numCohorts: 3 }),
			).toEqual([2021, 2022, 2023]);
		}
	});
});

describe("getAcademyStrength", () => {
	test("a bigger scouting budget makes a better academy", () => {
		const atDefault = getAcademyStrength({
			scoutingLevel: DEFAULT_LEVEL,
			tier: 1,
		});
		expect(atDefault).toBeCloseTo(0);
		expect(
			getAcademyStrength({ scoutingLevel: MAX_LEVEL, tier: 1 }),
		).toBeGreaterThan(atDefault);
		expect(getAcademyStrength({ scoutingLevel: 1, tier: 1 })).toBeLessThan(
			atDefault,
		);
	});

	test("each tier below the top costs the same", () => {
		expect(
			getAcademyStrength({ scoutingLevel: DEFAULT_LEVEL, tier: 2 }),
		).toBeCloseTo(-ACADEMY_TIER_PENALTY);
		expect(
			getAcademyStrength({ scoutingLevel: DEFAULT_LEVEL, tier: 3 }),
		).toBeCloseTo(-2 * ACADEMY_TIER_PENALTY);
	});
});

describe("allocateAcademyProspects", () => {
	const noLuck = () => 0.5;

	test("every club gets the same number of prospects, give or take one", () => {
		const tids = allocateAcademyProspects({
			pots: [40, 70, 55, 60, 45, 50, 65],
			clubs: [
				{ tid: 0, strength: 1 },
				{ tid: 1, strength: 0 },
				{ tid: 2, strength: -1 },
			],
		});

		const counts = [0, 1, 2].map(
			(tid) => tids.filter((other) => other === tid).length,
		);
		expect(counts.toSorted()).toEqual([2, 2, 3]);
	});

	test("with no luck, clubs pick the best prospect left in order of strength every round", () => {
		// Best first: 70 (index 1), 65 (6), 60 (3), 55 (2), 50 (5), 45 (4), 40 (0).
		// Every round, tid 1 picks first, then tid 2, then tid 0.
		const tids = allocateAcademyProspects({
			pots: [40, 70, 55, 60, 45, 50, 65],
			clubs: [
				{ tid: 0, strength: -1 },
				{ tid: 1, strength: 1 },
				{ tid: 2, strength: 0 },
			],
			random: noLuck,
		});

		expect(tids).toEqual([1, 1, 1, 0, 0, 2, 2]);
	});

	test("luck can put a weaker academy first", () => {
		// tid 0 gets the most luck and tid 1 the least
		const luck = [1, 0];
		let i = 0;
		const tids = allocateAcademyProspects({
			pots: [50, 60],
			clubs: [
				{ tid: 0, strength: 0 },
				{ tid: 1, strength: 0.5 },
			],
			random: () => luck[i++ % luck.length]!,
		});

		expect(tids).toEqual([1, 0]);
	});

	test("with no clubs, nobody joins an academy", () => {
		expect(allocateAcademyProspects({ pots: [50, 60], clubs: [] })).toEqual([
			undefined,
			undefined,
		]);
	});
});

describe("planAcademyPromotions", () => {
	const player = (value: number, valueNoPot: number) => ({
		value,
		valueNoPot,
	});

	const ai = {
		minRosterSize: 2,
		maxRosterSize: 15,
		rotationSize: 10,
	};

	test("an AI club only promotes a young prospect early if he'd already be in its rotation, not just because he's promising", () => {
		// On current ratings, the 10th best of these 12 players is at 61
		const roster = Array.from({ length: 12 }, (_, i) => player(70 - i, 70 - i));
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [
					{ pid: 1, ...player(80, 62), graduating: false },
					{ pid: 2, ...player(90, 60), graduating: false },
				],
				roster,
			}),
		).toEqual({ promote: [1], release: [] });
	});

	test("once the roster is full, each promotion raises the bar for the next", () => {
		// The first takes the place of the player worth 50, and then the second
		// isn't better than anyone left on current ratings
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [
					{ pid: 1, ...player(62, 52), graduating: false },
					{ pid: 2, ...player(61, 51), graduating: false },
				],
				roster: [player(50, 50), player(60, 60)],
				maxRosterSize: 2,
			}),
		).toEqual({ promote: [1], release: [] });
	});

	test("a prospect who'd be the first one released isn't promoted early", () => {
		// Better right now than the player worth 60, but worth less than him
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [{ pid: 1, ...player(52, 51), graduating: false }],
				roster: [player(60, 48), player(70, 70)],
				maxRosterSize: 2,
			}),
		).toEqual({ promote: [], release: [] });
	});

	test("at graduation, an AI club keeps a prospect worth more than its worst first-team player counting potential", () => {
		const roster = [player(50, 50), player(60, 60)];
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [{ pid: 1, ...player(55, 40), graduating: true }],
				roster,
				maxRosterSize: 2,
			}),
		).toEqual({ promote: [1], release: [] });

		// The same player a year younger isn't ready to be promoted early
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [{ pid: 1, ...player(55, 40), graduating: false }],
				roster,
				maxRosterSize: 2,
			}),
		).toEqual({ promote: [], release: [] });
	});

	test("an AI club keeps graduates while it's short of players, and releases the rest", () => {
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [
					{ pid: 1, ...player(30, 30), graduating: true },
					{ pid: 2, ...player(35, 35), graduating: true },
					{ pid: 3, ...player(20, 20), graduating: true },
				],
				roster: [player(50, 50), player(60, 60)],
				minRosterSize: 4,
			}),
		).toEqual({ promote: [2, 1], release: [3] });
	});

	test("a graduate who isn't better than anyone goes to free agency, even with space on the roster", () => {
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [{ pid: 1, ...player(30, 30), graduating: true }],
				roster: [player(50, 50), player(60, 60)],
			}),
		).toEqual({ promote: [], release: [1] });
	});

	test("an AI club with nobody on its first team keeps its graduates, but not its younger prospects", () => {
		expect(
			planAcademyPromotions({
				...ai,
				prospects: [
					{ pid: 1, ...player(40, 40), graduating: false },
					{ pid: 2, ...player(30, 30), graduating: true },
				],
				roster: [],
				minRosterSize: 10,
			}),
		).toEqual({ promote: [2], release: [] });
	});
});

describe("getAcademyContract", () => {
	test("a graduate promoted in the summer signs for the minimum through 3 more seasons", () => {
		expect(
			getAcademyContract({
				season: 2020,
				phase: PHASE.DRAFT,
				minContract: 750,
			}),
		).toEqual({ amount: 750, exp: 2023, rookie: true });
	});

	test("before the season ends, this season is the first of the 3", () => {
		expect(
			getAcademyContract({
				season: 2020,
				phase: PHASE.REGULAR_SEASON,
				minContract: 750,
			}),
		).toEqual({ amount: 750, exp: 2022, rookie: true });
	});
});

describe("getAcademyDraftYear", () => {
	test("is the season a graduate joins a first team after", () => {
		expect(getAcademyDraftYear(2020, PHASE.DRAFT)).toBe(2020);
		expect(getAcademyDraftYear(2020, PHASE.PRESEASON)).toBe(2019);
	});
});
