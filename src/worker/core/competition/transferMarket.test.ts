import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import {
	getSeasonProgress,
	getTransferFee,
	getTransferWindow,
	getWageBudget,
	getWinterWindowDays,
	canSignWithinWageBudget,
} from "./transferMarket.ts";

describe("getWinterWindowDays", () => {
	test("matches the days getTransferWindow has the winter window open", () => {
		for (const tradeDeadline of [0.1, 0.45, 0.6, 1]) {
			for (const lastDay of [30, 99, 100, 164]) {
				const days = getWinterWindowDays({ lastDay, tradeDeadline })!;
				for (let day = 1; day <= lastDay; day++) {
					const open =
						getTransferWindow({
							phase: PHASE.REGULAR_SEASON,
							seasonProgress: getSeasonProgress(day, lastDay),
							tradeDeadline,
						}) === "winter";
					expect(open, `${tradeDeadline} ${lastDay} ${day}`).toBe(
						day >= days.openDay && day < days.closeDay,
					);
				}
			}
		}
	});

	test("the trade deadline day closes it", () => {
		const days = getWinterWindowDays({ lastDay: 100, tradeDeadline: 0.5 })!;
		expect(
			getWinterWindowDays({
				lastDay: 100,
				tradeDeadline: 0.5,
				deadlineDay: days.closeDay - 2,
			}),
		).toEqual({ openDay: days.openDay, closeDay: days.closeDay - 2 });
		expect(
			getWinterWindowDays({
				lastDay: 100,
				tradeDeadline: 0.5,
				deadlineDay: days.openDay,
			}),
		).toBeUndefined();
	});
});

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
	const afterASeason = {
		salaryCap: 100000,
		revenue: 300000,
		runningCosts: 120000,
		cash: 0,
		minWageBudget: 20000,
		popRank: 15,
		numTeams: 30,
	};

	test("is what last season's revenue left after running costs", () => {
		expect(getWageBudget(afterASeason)).toBe(180000);
		expect(getWageBudget({ ...afterASeason, revenue: 200000 })).toBe(80000);
	});

	test("pays off debt over 3 seasons, and spends a fifth of spare cash", () => {
		expect(getWageBudget({ ...afterASeason, cash: -90000 })).toBe(150000);
		expect(getWageBudget({ ...afterASeason, cash: 50000 })).toBe(190000);
	});

	test("stays between enough for a squad on minimum contracts and double the cap", () => {
		expect(
			getWageBudget({ ...afterASeason, revenue: 100000, cash: -300000 }),
		).toBe(20000);
		expect(getWageBudget({ ...afterASeason, revenue: 1000000 })).toBe(200000);
	});

	test("before a club's first season is over, its budget covers its starting payroll with some room", () => {
		const budget = (startingPayroll: number | undefined, revenue?: number) =>
			getWageBudget({
				salaryCap: 100000,
				revenue,
				runningCosts: 100000,
				cash: 0,
				minWageBudget: 0,
				popRank: 5,
				numTeams: 5,
				startingPayroll,
			});

		// The smallest market's budget is 0.8 times the cap
		expect(budget(undefined)).toBe(80000);
		expect(budget(50000)).toBe(80000);
		expect(budget(150000)).toBe(160000);

		// Once there's revenue, the starting payroll doesn't count
		expect(budget(150000, 200000)).toBe(100000);
	});

	test("without revenue yet, bigger markets get bigger budgets", () => {
		const budget = (popRank: number) =>
			getWageBudget({
				salaryCap: 100000,
				revenue: undefined,
				runningCosts: 0,
				cash: 0,
				minWageBudget: 0,
				popRank,
				numTeams: 5,
			});

		expect(budget(1)).toBe(120000);
		expect(budget(3)).toBe(100000);
		expect(budget(5)).toBe(80000);
	});
});

describe("canSignWithinWageBudget", () => {
	const base = {
		payroll: 90000,
		wageBudget: 100000,
		minContract: 1000,
	};

	test("allows a signing or re-signing that fits the budget, and refuses one that doesn't", () => {
		expect(canSignWithinWageBudget({ ...base, amount: 10000 })).toBe(true);
		expect(canSignWithinWageBudget({ ...base, amount: 10002 })).toBe(false);
	});

	test("like a hard cap, only a minimum contract can go over", () => {
		const overBudget = { ...base, payroll: 150000 };

		expect(canSignWithinWageBudget({ ...overBudget, amount: 1000 })).toBe(true);
		expect(canSignWithinWageBudget({ ...overBudget, amount: 20000 })).toBe(
			false,
		);
	});
});
