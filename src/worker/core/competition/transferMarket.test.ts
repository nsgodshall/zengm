import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import {
	getSeasonProgress,
	getTransferFee,
	getTransferWindow,
	getWageBudget,
} from "./transferMarket.ts";

describe("getTransferWindow", () => {
	test("the summer window is open from the end of the season through the preseason", () => {
		for (const phase of [
			PHASE.DRAFT_LOTTERY,
			PHASE.DRAFT,
			PHASE.AFTER_DRAFT,
			PHASE.RESIGN_PLAYERS,
			PHASE.FREE_AGENCY,
			PHASE.PRESEASON,
		]) {
			expect(
				getTransferWindow({ phase, seasonProgress: 0, tradeDeadline: 0.6 }),
			).toBe("summer");
		}
	});

	test("the winter window is the stretch of regular season before the trade deadline", () => {
		const windowAt = (seasonProgress: number) =>
			getTransferWindow({
				phase: PHASE.REGULAR_SEASON,
				seasonProgress,
				tradeDeadline: 0.6,
			});

		expect(windowAt(0)).toBe(undefined);
		expect(windowAt(0.44)).toBe(undefined);
		expect(windowAt(0.45)).toBe("winter");
		expect(windowAt(0.59)).toBe("winter");
		expect(windowAt(0.6)).toBe(undefined);
	});

	test("with no trade deadline, the winter window still closes partway through the season", () => {
		const windowAt = (seasonProgress: number) =>
			getTransferWindow({
				phase: PHASE.REGULAR_SEASON,
				seasonProgress,
				tradeDeadline: 1,
			});

		expect(windowAt(0.5)).toBe("winter");
		expect(windowAt(0.7)).toBe(undefined);
	});

	test("closed after the trade deadline, in the playoffs, and during expansion/fantasy drafts", () => {
		for (const phase of [
			PHASE.AFTER_TRADE_DEADLINE,
			PHASE.PLAYOFFS,
			PHASE.EXPANSION_DRAFT,
			PHASE.FANTASY_DRAFT,
		]) {
			expect(
				getTransferWindow({ phase, seasonProgress: 0.5, tradeDeadline: 0.6 }),
			).toBe(undefined);
		}
	});
});

test("getSeasonProgress runs from 0 on the first day toward 1 on the last", () => {
	expect(getSeasonProgress(1, 100)).toBe(0);
	expect(getSeasonProgress(51, 100)).toBe(0.5);
	expect(getSeasonProgress(100, 100)).toBe(0.99);
	expect(getSeasonProgress(1, 0)).toBe(0);
});

describe("getTransferFee", () => {
	test("is the market wage for each season left, up to 4, adjusted for age", () => {
		// 28 years old: no age adjustment
		expect(getTransferFee({ marketWage: 10000, age: 28, seasonsLeft: 1 })).toBe(
			10000,
		);
		expect(getTransferFee({ marketWage: 10000, age: 28, seasonsLeft: 3 })).toBe(
			30000,
		);
		expect(getTransferFee({ marketWage: 10000, age: 28, seasonsLeft: 6 })).toBe(
			40000,
		);
	});

	test("young players cost more and old players less", () => {
		const fee = (age: number) =>
			getTransferFee({ marketWage: 10000, age, seasonsLeft: 2 });

		expect(fee(20)).toBeGreaterThan(fee(26));
		expect(fee(26)).toBeGreaterThan(fee(29));
		expect(fee(29)).toBeGreaterThan(fee(34));
	});

	test("a player out of contract is free", () => {
		expect(getTransferFee({ marketWage: 10000, age: 25, seasonsLeft: 0 })).toBe(
			0,
		);
	});

	test("rounds to the nearest $50k", () => {
		expect(getTransferFee({ marketWage: 1234, age: 28, seasonsLeft: 1 })).toBe(
			1250,
		);
	});
});

describe("getWageBudget", () => {
	test("scales the salary cap by revenue compared to the league average", () => {
		const budget = (revenue: number) =>
			getWageBudget({
				salaryCap: 100000,
				revenue,
				averageRevenue: 200000,
				popRank: 15,
				numTeams: 30,
			});

		expect(budget(200000)).toBe(100000);
		expect(budget(300000)).toBe(150000);
		expect(budget(100000)).toBe(50000);
	});

	test("stays between half and double the cap", () => {
		const budget = (revenue: number) =>
			getWageBudget({
				salaryCap: 100000,
				revenue,
				averageRevenue: 200000,
				popRank: 15,
				numTeams: 30,
			});

		expect(budget(1000000)).toBe(200000);
		expect(budget(10000)).toBe(50000);
	});

	test("without revenue yet, bigger markets get bigger budgets", () => {
		const budget = (popRank: number) =>
			getWageBudget({
				salaryCap: 100000,
				revenue: undefined,
				averageRevenue: 0,
				popRank,
				numTeams: 5,
			});

		expect(budget(1)).toBe(120000);
		expect(budget(3)).toBe(100000);
		expect(budget(5)).toBe(80000);
	});
});
