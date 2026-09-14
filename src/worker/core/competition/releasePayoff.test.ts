import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import { getContractPayoff } from "./releasePayoff.ts";

describe("getContractPayoff", () => {
	const contract = { amount: 10000, exp: 2028, currentSeason: 2026 };

	test("before the regular season, all of this season is still owed", () => {
		expect(
			getContractPayoff({
				...contract,
				phase: PHASE.PRESEASON,
				numGamesRemaining: 0,
				numGames: 30,
			}),
		).toBe(30000);
	});

	test("in the regular season, the share of this season's games still to play is owed", () => {
		expect(
			getContractPayoff({
				...contract,
				phase: PHASE.REGULAR_SEASON,
				numGamesRemaining: 15,
				numGames: 30,
			}),
		).toBe(25000);
	});

	test("once the season is over, only later seasons are owed", () => {
		expect(
			getContractPayoff({
				...contract,
				phase: PHASE.RESIGN_PLAYERS,
				numGamesRemaining: 0,
				numGames: 30,
			}),
		).toBe(20000);
		expect(
			getContractPayoff({
				...contract,
				exp: 2026,
				phase: PHASE.DRAFT,
				numGamesRemaining: 0,
				numGames: 30,
			}),
		).toBe(0);
	});
});
