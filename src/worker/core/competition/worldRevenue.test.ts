import { describe, expect, test } from "vitest";
import { MAX_LEVEL } from "../../../common/budgetLevels.ts";
import {
	AVERAGE_HYPE,
	getCapitalInvestment,
	getChampionPrize,
	getProjectedRevenue,
	getTvShareWithParachute,
	getPromotionPrize,
	getReinvestedBudgetLevel,
	getTvShare,
	regressHype,
	WORLD_REVENUE_SETTINGS,
} from "./worldRevenue.ts";

describe("getCapitalInvestment", () => {
	test("keeps one season of revenue and invests a bounded share of the rest", () => {
		expect(getCapitalInvestment({ cash: 100_000, revenue: 200_000 })).toBe(0);
		expect(getCapitalInvestment({ cash: 300_000, revenue: 200_000 })).toBe(
			25_000,
		);
		expect(getCapitalInvestment({ cash: 3_000_000, revenue: 200_000 })).toBe(
			200_000,
		);
	});
});

describe("getReinvestedBudgetLevel", () => {
	const revenue = 200_000;

	test("keeps the market size's level unless a club has more cash than a season's revenue", () => {
		expect(
			getReinvestedBudgetLevel({ level: 34, cash: -50_000, revenue }),
		).toBe(34);
		expect(
			getReinvestedBudgetLevel({ level: 34, cash: revenue, revenue }),
		).toBe(34);
		expect(
			getReinvestedBudgetLevel({ level: 34, cash: 1000, revenue: 0 }),
		).toBe(34);
	});

	test("raises it for each season's revenue of spare cash, up to a limit", () => {
		const { reinvestLevelsPerSeason, maxReinvestSeasons } =
			WORLD_REVENUE_SETTINGS;
		expect(
			getReinvestedBudgetLevel({ level: 34, cash: 2 * revenue, revenue }),
		).toBe(34 + reinvestLevelsPerSeason);
		expect(
			getReinvestedBudgetLevel({ level: 34, cash: 20 * revenue, revenue }),
		).toBe(
			Math.min(MAX_LEVEL, 34 + reinvestLevelsPerSeason * maxReinvestSeasons),
		);
		expect(
			getReinvestedBudgetLevel({ level: 95, cash: 20 * revenue, revenue }),
		).toBe(MAX_LEVEL);
	});
});

describe("regressHype", () => {
	test("moves hype part of the way back to average", () => {
		const { hypeRegression } = WORLD_REVENUE_SETTINGS;
		expect(regressHype(AVERAGE_HYPE)).toBe(AVERAGE_HYPE);
		expect(regressHype(1)).toBeCloseTo(1 - hypeRegression * (1 - AVERAGE_HYPE));
		expect(regressHype(0)).toBeCloseTo(hypeRegression * AVERAGE_HYPE);
		expect(regressHype(0.8)).toBeLessThan(0.8);
		expect(regressHype(0.8)).toBeGreaterThan(AVERAGE_HYPE);
		expect(regressHype(0.2)).toBeGreaterThan(0.2);
		expect(regressHype(0.2)).toBeLessThan(AVERAGE_HYPE);
	});
});

describe("getTvShare", () => {
	test("is bigger in higher tiers, and the lowest listed share covers any lower tier", () => {
		const [top, second, third] = WORLD_REVENUE_SETTINGS.tvShareByTier;
		expect(getTvShare(1)).toBe(top);
		expect(getTvShare(2)).toBe(second);
		expect(getTvShare(3)).toBe(third);
		expect(getTvShare(5)).toBe(third);
		expect(top!).toBeGreaterThan(second!);
		expect(second!).toBeGreaterThan(third!);
	});
});

describe("prize money", () => {
	test("winning a Division pays more in a higher tier, and more than being promoted from it", () => {
		const salaryCap = 100000;
		expect(getChampionPrize({ tier: 1, salaryCap })).toBeGreaterThan(
			getChampionPrize({ tier: 2, salaryCap }),
		);
		for (const tier of [2, 3]) {
			expect(getChampionPrize({ tier, salaryCap })).toBeGreaterThan(
				getPromotionPrize({ tier, salaryCap }),
			);
		}
	});
});

describe("getProjectedRevenue", () => {
	test("swaps last season's TV money for the current tier's", () => {
		const share = (tier: number) => getTvShare(tier);
		expect(
			getProjectedRevenue({
				revenue: 200000,
				nationalTv: 30000,
				lastTier: 2,
				tier: 1,
			}),
		).toBeCloseTo(170000 + (30000 * share(1)) / share(2));
		expect(
			getProjectedRevenue({
				revenue: 200000,
				nationalTv: 30000,
				lastTier: 2,
				tier: 2,
			}),
		).toBe(200000);
	});
});

describe("getTvShareWithParachute", () => {
	const history = (tiers: Record<number, number>) =>
		Object.entries(tiers).map(([season, tier]) => ({
			season: Number(season),
			tier,
		}));

	test("pays a relegated club part of what it lost, fading out", () => {
		const relegated = history({ 2026: 1, 2027: 1 });
		const first = getTvShareWithParachute({
			tier: 2,
			season: 2028,
			history: relegated,
		});
		const second = getTvShareWithParachute({
			tier: 2,
			season: 2029,
			history: relegated,
		});
		const third = getTvShareWithParachute({
			tier: 2,
			season: 2030,
			history: relegated,
		});

		expect(first).toBeGreaterThan(second);
		expect(second).toBeGreaterThan(third);
		expect(third).toBe(getTvShare(2));
		expect(first).toBeLessThan(getTvShare(1));
	});

	test("stops as soon as the club is back up", () => {
		expect(
			getTvShareWithParachute({
				tier: 1,
				season: 2029,
				history: history({ 2027: 1, 2028: 2 }),
			}),
		).toBe(getTvShare(1));
	});

	test("pays nothing to a club that has always been in its tier", () => {
		expect(
			getTvShareWithParachute({
				tier: 2,
				season: 2029,
				history: history({ 2027: 2, 2028: 2 }),
			}),
		).toBe(getTvShare(2));
		expect(
			getTvShareWithParachute({ tier: 1, season: 2029, history: undefined }),
		).toBe(getTvShare(1));
	});

	test("counts the tier a club last played in, after two relegations", () => {
		expect(
			getTvShareWithParachute({
				tier: 3,
				season: 2029,
				history: history({ 2027: 1, 2028: 2 }),
			}),
		).toBeGreaterThan(
			getTvShareWithParachute({
				tier: 3,
				season: 2029,
				history: history({ 2027: 2, 2028: 2 }),
			}),
		);
	});

	test("carries into the wage budget a relegated club plans on", () => {
		const relegated = history({ 2026: 1, 2027: 1 });
		const withParachute = getProjectedRevenue({
			revenue: 200000,
			nationalTv: 30000,
			lastTier: 1,
			tier: 2,
			season: 2028,
			history: relegated,
		});
		const without = getProjectedRevenue({
			revenue: 200000,
			nationalTv: 30000,
			lastTier: 1,
			tier: 2,
		});

		expect(withParachute).toBeGreaterThan(without);
		expect(withParachute).toBeLessThan(200000);
	});
});
