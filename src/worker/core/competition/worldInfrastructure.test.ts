import { describe, expect, test } from "vitest";
import {
	buildWorldPreseasonFinance,
	getInitialWorldInfrastructure,
	getWorldAcademyInfrastructureBonus,
	getWorldCommercialRevenueMultiplier,
	investInWorldInfrastructure,
	projectWorldClubFinances,
} from "./worldInfrastructure.ts";

const budget = {
	ticketPrice: 40,
	scouting: 30,
	coaching: 40,
	health: 35,
	facilities: 20,
};

describe("World infrastructure", () => {
	test("initializes durable assets from the club's existing operation", () => {
		const infrastructure = getInitialWorldInfrastructure(budget);
		expect(infrastructure.academy.level).toBe(30);
		expect(infrastructure.training.level).toBe(40);
		expect(infrastructure.medical.level).toBe(35);
		expect(infrastructure.stadium.level).toBe(20);
	});

	test("puts investment into the weakest assets and records every allocation", () => {
		const result = investInWorldInfrastructure({
			infrastructure: getInitialWorldInfrastructure(budget),
			investment: 25_000,
			revenue: 100_000,
		});
		expect(result.investmentSpent).toBe(25_000);
		expect(Object.values(result.allocations).reduce((a, b) => a + b, 0)).toBe(
			25_000,
		);
		expect(result.infrastructure.stadium.level).toBeGreaterThan(20);
		expect(result.infrastructure.commercial.level).toBeGreaterThan(20);
		expect(result.stadiumSeatsAdded).toBeGreaterThan(0);
	});

	test("charges debt interest and limits exceptional owner support", () => {
		expect(
			buildWorldPreseasonFinance({ cash: -50_000, revenue: 100_000 }),
		).toMatchObject({ debtInterest: 2_500, ownerFunding: 0 });
		expect(
			buildWorldPreseasonFinance({ cash: -250_000, revenue: 100_000 }),
		).toMatchObject({ debtInterest: 12_500, ownerFunding: 62_500 });
	});

	test("reserves only a share of new revenue for a promotion push", () => {
		expect(
			buildWorldPreseasonFinance({
				cash: 0,
				revenue: 100_000,
				promotionRevenueGain: 50_000,
			}).promotionSpendingLimit,
		).toBe(10_000);
	});

	test("projects cash and compounding debt interest for three seasons", () => {
		const projection = projectWorldClubFinances({
			season: 2030,
			cash: -100_000,
			revenue: 180_000,
			runningCosts: 80_000,
			payroll: 120_000,
		});
		expect(projection).toEqual([
			{
				season: 2031,
				cash: -125_000,
				debt: 125_000,
				interest: 5_000,
				operatingResult: -20_000,
			},
			{
				season: 2032,
				cash: -151_250,
				debt: 151_250,
				interest: 6_250,
				operatingResult: -20_000,
			},
			{
				season: 2033,
				cash: -178_813,
				debt: 178_813,
				interest: 7_563,
				operatingResult: -20_000,
			},
		]);
	});

	test("asset levels expose sporting and commercial benefits", () => {
		expect(getWorldAcademyInfrastructureBonus(1)).toBe(0);
		expect(getWorldCommercialRevenueMultiplier(1)).toBe(1);
		expect(getWorldAcademyInfrastructureBonus(70)).toBeGreaterThan(0);
		expect(getWorldCommercialRevenueMultiplier(70)).toBeGreaterThan(1);
	});
});
