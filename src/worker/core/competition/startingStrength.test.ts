import { describe, expect, test } from "vitest";
import { assignSquads, getSquadOrder } from "./startingStrength.ts";

// The same numbers every time
const seededRandom = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
};

describe("getSquadOrder", () => {
	test("goes by tier, then by market size, when the randomness is the same for every club", () => {
		const clubs = [
			{ tid: 0, tier: 1, pop: 2 },
			{ tid: 1, tier: 2, pop: 9 },
			{ tid: 2, tier: 1, pop: 8 },
			{ tid: 3, tier: 2, pop: 1 },
			{ tid: 4, tier: 1, pop: 5 },
		];
		expect(getSquadOrder({ clubs, random: () => 0.5 })).toEqual([
			2, 4, 0, 1, 3,
		]);
	});

	test("a second-tier club only rarely gets a squad from the top half", () => {
		// Two Countries of 16 clubs a tier, like the pilot World
		const clubs = Array.from({ length: 64 }, (_, tid) => ({
			tid,
			tier: tid < 32 ? 1 : 2,
			pop: 10 - (tid % 32) / 4,
		}));

		let numInTopHalf = 0;
		const numWorlds = 200;
		for (let seed = 1; seed <= numWorlds; seed++) {
			const order = getSquadOrder({ clubs, random: seededRandom(seed) });
			numInTopHalf += order.slice(0, 32).filter((tid) => tid >= 32).length;
		}

		const perWorld = numInTopHalf / numWorlds;
		expect(perWorld).toBeGreaterThan(0);
		expect(perWorld).toBeLessThan(2);
	});

	test("the biggest top-tier club leans towards one of the strongest squads", () => {
		const clubs = Array.from({ length: 64 }, (_, tid) => ({
			tid,
			tier: tid < 32 ? 1 : 2,
			pop: 10 - (tid % 32) / 4,
		}));

		const places: number[] = [];
		for (let seed = 1; seed <= 200; seed++) {
			const order = getSquadOrder({ clubs, random: seededRandom(seed) });
			places.push(order.indexOf(0));
		}

		// Clubs almost as big are close behind it, so it isn't always first
		const averagePlace =
			places.reduce((sum, place) => sum + place, 0) / places.length;
		expect(averagePlace).toBeLessThan(5);
		expect(Math.max(...places)).toBeLessThan(16);
	});
});

describe("assignSquads", () => {
	test("gives the strongest squad to the first club in the order", () => {
		const newTidByTid = assignSquads({
			squadOvrs: [
				{ tid: 0, ovr: 40 },
				{ tid: 1, ovr: 60 },
				{ tid: 2, ovr: 50 },
			],
			order: [2, 0, 1],
		});
		expect([...newTidByTid.entries()].sort((a, b) => a[0] - b[0])).toEqual([
			[0, 1],
			[1, 2],
			[2, 0],
		]);
	});
});
