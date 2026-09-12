import { describe, expect, test } from "vitest";
import { range } from "../../../common/utils.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import {
	getDivisionRounds,
	getRoundRobinRounds,
	mergeRoundsIntoDays,
	newWorldSchedule,
	type Round,
} from "./worldSchedule.ts";

const countGames = (rounds: Round[]) => {
	const home = new Map<number, number>();
	const away = new Map<number, number>();
	for (const [homeTid, awayTid] of rounds.flat()) {
		home.set(homeTid, (home.get(homeTid) ?? 0) + 1);
		away.set(awayTid, (away.get(awayTid) ?? 0) + 1);
	}

	return {
		home: (tid: number) => home.get(tid) ?? 0,
		away: (tid: number) => away.get(tid) ?? 0,
		total: (tid: number) => (home.get(tid) ?? 0) + (away.get(tid) ?? 0),
	};
};

// How many times each ordered [home, away] pairing happens
const countPairings = (rounds: Round[]) => {
	const counts = new Map<string, number>();
	for (const [homeTid, awayTid] of rounds.flat()) {
		const key = `${homeTid}@${awayTid}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return (homeTid: number, awayTid: number) =>
		counts.get(`${homeTid}@${awayTid}`) ?? 0;
};

const expectNoClubTwiceInARound = (rounds: Round[]) => {
	for (const round of rounds) {
		const tids = round.flat();
		expect(new Set(tids).size).toBe(tids.length);
	}
};

const makeTids = (numClubs: number) => range(numClubs).map((i) => 100 + i);

describe("getRoundRobinRounds", () => {
	test.each([2, 3, 4, 7, 8, 20])(
		"%i clubs: everyone plays everyone exactly once, at most once a round",
		(numClubs) => {
			const tids = makeTids(numClubs);
			const rounds = getRoundRobinRounds(tids);

			// An odd number of clubs needs an extra round, since one rests each round
			expect(rounds.length).toBe(numClubs % 2 === 0 ? numClubs - 1 : numClubs);
			expectNoClubTwiceInARound(rounds);

			const pairs = rounds
				.flat()
				.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
			expect(pairs.length).toBe((numClubs * (numClubs - 1)) / 2);
			expect(new Set(pairs).size).toBe(pairs.length);
		},
	);

	test.each([2, 4, 8, 20])(
		"%i clubs: home and away differ by at most 1",
		(numClubs) => {
			const tids = makeTids(numClubs);
			const counts = countGames(getRoundRobinRounds(tids));
			for (const tid of tids) {
				expect(
					Math.abs(counts.home(tid) - counts.away(tid)),
				).toBeLessThanOrEqual(1);
			}
		},
	);

	test.each([3, 7, 19])(
		"%i clubs: home and away are exactly equal",
		(numClubs) => {
			const tids = makeTids(numClubs);
			const counts = countGames(getRoundRobinRounds(tids));
			for (const tid of tids) {
				expect(counts.home(tid)).toBe(counts.away(tid));
			}
		},
	);

	test("fewer than 2 clubs have no games", () => {
		expect(getRoundRobinRounds([])).toEqual([]);
		expect(getRoundRobinRounds([5])).toEqual([]);
	});
});

describe("getDivisionRounds", () => {
	test.each([7, 8])(
		"%i clubs, double round robin: every pair meets once at each ground",
		(numClubs) => {
			const tids = makeTids(numClubs);
			const rounds = getDivisionRounds(tids, 2 * (numClubs - 1));
			expectNoClubTwiceInARound(rounds);

			const pairings = countPairings(rounds);
			const counts = countGames(rounds);
			for (const tid of tids) {
				expect(counts.home(tid)).toBe(numClubs - 1);
				expect(counts.away(tid)).toBe(numClubs - 1);
				for (const otherTid of tids) {
					if (tid !== otherTid) {
						expect(pairings(tid, otherTid)).toBe(1);
					}
				}
			}
		},
	);

	test("longer seasons keep repeating round robins", () => {
		const tids = makeTids(4);
		const rounds = getDivisionRounds(tids, 9);
		expectNoClubTwiceInARound(rounds);

		// 3 round robins of 3 games each
		expect(rounds.length).toBe(9);
		const pairings = countPairings(rounds);
		const counts = countGames(rounds);
		for (const tid of tids) {
			expect(counts.total(tid)).toBe(9);
			for (const otherTid of tids) {
				if (tid !== otherTid) {
					expect(pairings(tid, otherTid) + pairings(otherTid, tid)).toBe(3);
				}
			}
		}
	});

	test("extra games past a full round robin are exact with an even number of clubs", () => {
		const tids = makeTids(6);
		const counts = countGames(getDivisionRounds(tids, 7));
		for (const tid of tids) {
			expect(counts.total(tid)).toBe(7);
		}
	});

	test("extra games with an odd number of clubs leave the clubs resting in those rounds a game short", () => {
		// One round robin of 5 clubs is 4 games in 5 rounds, then 2 extra rounds,
		// each with a different club resting
		const tids = makeTids(5);
		const counts = countGames(getDivisionRounds(tids, 6));
		const totals = tids.map((tid) => counts.total(tid)).sort();
		expect(totals).toEqual([5, 5, 6, 6, 6]);
	});

	test("no games for a Division of one club or a season of no games", () => {
		expect(getDivisionRounds([1], 10)).toEqual([]);
		expect(getDivisionRounds(makeTids(4), 0)).toEqual([]);
	});
});

describe("mergeRoundsIntoDays", () => {
	// Rounds with a unique club pairing each, so they're easy to find
	const makeRounds = (base: number, numRounds: number): Round[] =>
		range(numRounds).map((i) => [[base + i, base + 100 + i]]);

	test("the longest Division plays every day, and shorter ones start and finish with it", () => {
		const a = makeRounds(1000, 5);
		const b = makeRounds(2000, 3);
		const c = makeRounds(3000, 1);

		const days = mergeRoundsIntoDays([a, b, c]);

		expect(days.length).toBe(5);
		expect(days).toEqual([
			[a[0]![0], b[0]![0], c[0]![0]],
			[a[1]![0]],
			[a[2]![0], b[1]![0]],
			[a[3]![0]],
			[a[4]![0], b[2]![0]],
		]);
	});

	test("Divisions of the same length share every day", () => {
		const a = makeRounds(1000, 3);
		const b = makeRounds(2000, 3);
		expect(mergeRoundsIntoDays([a, b])).toEqual([
			[a[0]![0], b[0]![0]],
			[a[1]![0], b[1]![0]],
			[a[2]![0], b[2]![0]],
		]);
	});

	test("no rounds, no days", () => {
		expect(mergeRoundsIntoDays([])).toEqual([]);
		expect(mergeRoundsIntoDays([[], []])).toEqual([]);
	});
});

describe("newWorldSchedule", () => {
	// Uneven sizes, one odd, and Division-level season lengths
	const structure: CompetitionStructure = {
		countries: [
			{ countryId: 0, name: "Northland" },
			{ countryId: 1, name: "Southland" },
		],
		competitionDivisions: [
			// Default numGames 14 = a double round robin of 8 clubs
			{ divisionId: 1, countryId: 0, tier: 1, name: "Northland 1" },
			{
				divisionId: 2,
				countryId: 0,
				tier: 2,
				name: "Northland 2",
				numGames: 10,
			},
			{
				divisionId: 3,
				countryId: 1,
				tier: 1,
				name: "Southland 1",
				numGames: 12,
			},
			// 4 clubs play 14 games: 4 round robins plus 2 extra games
			{ divisionId: 4, countryId: 1, tier: 2, name: "Southland 2" },
		],
		promotionRelegationLinks: [],
	};
	const sizes = { 1: 8, 2: 6, 3: 7, 4: 4 } as Record<number, number>;
	const expectedNumGames = { 1: 14, 2: 10, 3: 12, 4: 14 } as Record<
		number,
		number
	>;

	const clubs = Object.entries(sizes).flatMap(([divisionId, size]) =>
		range(size).map((i) => ({
			tid: Number(divisionId) * 100 + i,
			divisionId: Number(divisionId),
		})),
	);
	const divisionIdByTid = new Map(
		clubs.map((club) => [club.tid, club.divisionId]),
	);

	test("every club plays only its own Division, with each Division's season length", () => {
		const days = newWorldSchedule(clubs, structure, { numGames: 14 });

		for (const [homeTid, awayTid] of days.flat()) {
			expect(divisionIdByTid.get(homeTid)).toBe(divisionIdByTid.get(awayTid));
		}

		const counts = countGames(days);
		for (const club of clubs) {
			expect(counts.total(club.tid)).toBe(expectedNumGames[club.divisionId]);
		}
	});

	test("no club plays twice in a day, and every Division plays on the first and last day", () => {
		const days = newWorldSchedule(clubs, structure, { numGames: 14 });
		expectNoClubTwiceInARound(days);

		// Northland 1 and Southland 1 both have 14 rounds
		expect(days.length).toBe(14);

		for (const day of [days[0]!, days.at(-1)!]) {
			const divisionIds = new Set(
				day.flat().map((tid) => divisionIdByTid.get(tid)),
			);
			expect([...divisionIds].sort()).toEqual([1, 2, 3, 4]);
		}
	});

	test("throws for a club in a Division that doesn't exist", () => {
		expect(() =>
			newWorldSchedule([...clubs, { tid: 999, divisionId: 99 }], structure, {
				numGames: 14,
			}),
		).toThrow(/Team 999 is in Division 99, which doesn't exist/);
	});

	test("applies the pacing hook to the finished calendar", () => {
		const pacing = (days: Round[]) => [...days].reverse();
		const days = newWorldSchedule(clubs, structure, { numGames: 14, pacing });
		expect(days.length).toBe(14);
		expectNoClubTwiceInARound(days);
	});
});
