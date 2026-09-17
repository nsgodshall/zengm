import { describe, expect, test } from "vitest";
import { buildClubSquadPlan } from "./clubSquadPlan.ts";
import {
	getWorldCountryIdByPlayerCountry,
	getWorldWageExpectedRole,
	getWorldWageMarketAgeGroup,
	getWorldWageMarketBidLimit,
	getWorldWageMarketInterest,
	getWorldWageMarketRecruitmentScore,
} from "./localWageMarket.ts";

const buildPlan = (
	rosterValues = [80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15],
) =>
	buildClubSquadPlan({
		rosterValues,
		wageBudget: 100_000,
		minContract: 1_000,
		minimumRosterSize: 14,
		maxRosterSize: 18,
		rotationSize: 10,
	});

const player = {
	age: 25,
	contractAmount: 5_000,
	homeCountryId: 1,
	value: 64,
	valueNoPot: 62,
};

const club = (plan = buildPlan()) => ({
	tid: 1,
	countryId: 1,
	tier: 2,
	capSpace: 50_000,
	plan,
	focus: "current" as const,
});

describe("local World wage markets", () => {
	test("maps every Country name alias to the same market", () => {
		const ids = getWorldCountryIdByPlayerCountry([
			{
				countryId: 4,
				name: "United Kingdom",
				nameCountries: ["England", "Scotland", "Wales", "Northern Ireland"],
			},
		]);
		expect(ids.get("united kingdom")).toBe(4);
		expect(ids.get("scotland")).toBe(4);
	});

	test("forms interest from country, tier, offered role, age, and squad need", () => {
		const interest = getWorldWageMarketInterest({ club: club(), player });
		expect(interest).toMatchObject({
			need: "upgradeStarter",
			role: "starter",
			expectedRole: "rotation",
			local: true,
			market: {
				countryId: 1,
				tier: 2,
				role: "starter",
				ageGroup: "prime",
			},
		});
	});

	test("rejects an unaffordable player and a player offered too little playing time", () => {
		expect(
			getWorldWageMarketInterest({
				club: { ...club(), capSpace: 4_999 },
				player,
			}),
		).toBeUndefined();

		const expensiveRotationPlayer = {
			...player,
			contractAmount: 12_000,
			value: 27,
			valueNoPot: 27,
		};
		expect(
			getWorldWageMarketInterest({
				club: club(),
				player: expensiveRotationPlayer,
			}),
		).toBeUndefined();
	});

	test("asking wages translate through each club's role ceilings", () => {
		const plan = buildPlan();
		expect(getWorldWageExpectedRole({ contractAmount: 40_000, plan })).toBe(
			"key",
		);
		expect(getWorldWageExpectedRole({ contractAmount: 10_000, plan })).toBe(
			"starter",
		);
		expect(getWorldWageExpectedRole({ contractAmount: 4_000, plan })).toBe(
			"rotation",
		);
		expect(getWorldWageExpectedRole({ contractAmount: 1_000, plan })).toBe(
			"depth",
		);
	});

	test("limits a club's bids to its real vacancies plus one upgrade", () => {
		expect(getWorldWageMarketBidLimit(buildPlan())).toBe(2);
		expect(
			getWorldWageMarketBidLimit(
				buildPlan([
					80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 14, 13,
				]),
			),
		).toBe(1);
	});

	test("groups ages around prospect development and veteran decline", () => {
		expect(getWorldWageMarketAgeGroup(23)).toBe("prospect");
		expect(getWorldWageMarketAgeGroup(24)).toBe("prime");
		expect(getWorldWageMarketAgeGroup(30)).toBe("veteran");
	});

	test("uses locality to decide between otherwise similar recruits", () => {
		const foreign = getWorldWageMarketRecruitmentScore({
			focus: "current",
			value: 50,
			valueNoPot: 50,
			local: false,
		});
		const local = getWorldWageMarketRecruitmentScore({
			focus: "current",
			value: 50,
			valueNoPot: 50,
			local: true,
		});
		expect(local).toBeGreaterThan(foreign);
	});
});
