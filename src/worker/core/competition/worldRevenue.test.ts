import { describe, expect, test } from "vitest";
import {
	getChampionPrize,
	getProjectedRevenue,
	getPromotionPrize,
	getTvShare,
	WORLD_REVENUE_SETTINGS,
} from "./worldRevenue.ts";

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
