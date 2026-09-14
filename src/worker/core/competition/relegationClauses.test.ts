import { describe, expect, test } from "vitest";
import { pickRelegationClausePlayers } from "./relegationClauses.ts";

describe("pickRelegationClausePlayers", () => {
	test("picks the best-paid players with a season left on their contracts", () => {
		const players = [
			{ pid: 1, contractAmount: 5000, seasonsLeft: 2 },
			{ pid: 2, contractAmount: 30000, seasonsLeft: 0 },
			{ pid: 3, contractAmount: 20000, seasonsLeft: 1 },
			{ pid: 4, contractAmount: 1000, seasonsLeft: 3 },
			{ pid: 5, contractAmount: 10000, seasonsLeft: 1 },
		];
		expect(pickRelegationClausePlayers(players, 2).map((p) => p.pid)).toEqual([
			3, 5,
		]);
		expect(pickRelegationClausePlayers(players, 10).map((p) => p.pid)).toEqual([
			3, 5, 1, 4,
		]);
	});
});
