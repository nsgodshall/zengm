import { describe, expect, test } from "vitest";
import type { CompetitionStructure } from "./competitionStructure.ts";
import {
	getRecentForm,
	getTableZones,
	orderDivisionsForDisplay,
} from "./leagueTableInfo.ts";

// Northland has 3 tiers, Southland 2
const structure: CompetitionStructure = {
	countries: [
		{ countryId: 0, name: "Northland" },
		{ countryId: 1, name: "Southland" },
	],
	competitionDivisions: [
		{ divisionId: 1, countryId: 0, tier: 1, name: "Northland 1" },
		{ divisionId: 2, countryId: 0, tier: 2, name: "Northland 2" },
		{ divisionId: 3, countryId: 0, tier: 3, name: "Northland 3" },
		{ divisionId: 4, countryId: 1, tier: 1, name: "Southland 1" },
		{ divisionId: 5, countryId: 1, tier: 2, name: "Southland 2" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 0,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 2,
			numAutoRelegated: 3,
			numPromotionPlayoffTeams: 4,
			numPromotionPlayoffSpots: 1,
		},
		{
			id: 2,
			countryId: 0,
			upperDivisionId: 2,
			lowerDivisionId: 3,
			numAutoPromoted: 1,
			numAutoRelegated: 1,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
		{
			id: 3,
			countryId: 1,
			upperDivisionId: 4,
			lowerDivisionId: 5,
			numAutoPromoted: 1,
			numAutoRelegated: 1,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
	],
};

describe("getTableZones", () => {
	test("a top tier only has a relegation zone", () => {
		expect(getTableZones(structure, 1, 6)).toEqual([
			undefined,
			undefined,
			undefined,
			"relegation",
			"relegation",
			"relegation",
		]);
	});

	test("a middle tier has promotion and promotion playoff places at the top, and relegation at the bottom", () => {
		expect(getTableZones(structure, 2, 10)).toEqual([
			"promotion",
			"promotion",
			"promotionPlayoff",
			"promotionPlayoff",
			"promotionPlayoff",
			"promotionPlayoff",
			undefined,
			undefined,
			undefined,
			"relegation",
		]);
	});

	test("a bottom tier only has promotion places", () => {
		expect(getTableZones(structure, 3, 3)).toEqual([
			"promotion",
			undefined,
			undefined,
		]);
	});

	test("a Division with no links has no zones", () => {
		expect(
			getTableZones({ ...structure, promotionRelegationLinks: [] }, 1, 2),
		).toEqual([undefined, undefined]);
	});

	test("zones never run past the clubs in the table", () => {
		expect(getTableZones(structure, 2, 3)).toHaveLength(3);
	});
});

describe("getRecentForm", () => {
	const game = (
		gid: number,
		day: number,
		winner: [number, number],
		loser: [number, number],
	) => ({
		gid,
		day,
		won: { tid: winner[0], pts: winner[1] },
		lost: { tid: loser[0], pts: loser[1] },
	});

	test("lists a club's latest results, oldest first, in day order", () => {
		const games = [
			game(4, 4, [0, 100], [1, 90]),
			game(1, 1, [1, 100], [0, 90]),
			game(3, 3, [0, 95], [2, 95]),
			game(2, 2, [2, 80], [1, 70]),
		];

		expect(getRecentForm(games, 0, 5)).toEqual(["L", "D", "W"]);
		expect(getRecentForm(games, 0, 2)).toEqual(["D", "W"]);
		expect(getRecentForm(games, 1, 5)).toEqual(["W", "L", "L"]);
	});

	test("a club with no games has no form", () => {
		expect(getRecentForm([], 0, 5)).toEqual([]);
	});
});

describe("orderDivisionsForDisplay", () => {
	const ids = (userDivisionId: number | undefined) =>
		orderDivisionsForDisplay(structure, userDivisionId).map(
			(division) => division.divisionId,
		);

	test("the user's Division comes first, then the rest of their Country by tier, then other Countries", () => {
		expect(ids(5)).toEqual([5, 4, 1, 2, 3]);
		expect(ids(2)).toEqual([2, 1, 3, 4, 5]);
	});

	test("with no user Division, Countries are in order, each by tier", () => {
		expect(ids(undefined)).toEqual([1, 2, 3, 4, 5]);
	});
});
