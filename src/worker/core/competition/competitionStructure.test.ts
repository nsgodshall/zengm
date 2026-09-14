import { describe, expect, test } from "vitest";
import {
	type CompetitionStructure,
	DEFAULT_DIVISION_ID,
	getDefaultCompetitionStructure,
	getDivisionIdForNewClub,
	getLegacyConfsDivs,
	getNewLeagueCompetition,
	getWorldSeasonLength,
	validateClubDivisions,
	validateCompetitionStructure,
} from "./competitionStructure.ts";

// The MVP pilot shape: 2 countries x 2 tiers, 2 up/2 down in each country
const pilot: CompetitionStructure = {
	countries: [
		{ countryId: 10, name: "Northland", abbrev: "NOR" },
		{ countryId: 20, name: "Southland" },
	],
	competitionDivisions: [
		{
			divisionId: 1,
			countryId: 10,
			tier: 1,
			name: "Northland 1",
			abbrev: "N1",
		},
		// Out of order on purpose, to check getLegacyConfsDivs sorts
		{ divisionId: 4, countryId: 20, tier: 2, name: "Southland 2" },
		{ divisionId: 2, countryId: 10, tier: 2, name: "Northland 2" },
		{ divisionId: 3, countryId: 20, tier: 1, name: "Southland 1" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 10,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 2,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
		{
			id: 2,
			countryId: 20,
			upperDivisionId: 3,
			lowerDivisionId: 4,
			numAutoPromoted: 1,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 4,
			numPromotionPlayoffSpots: 1,
		},
	],
};

// 4 clubs per Division of the pilot, tids 0-15
const pilotClubs = [1, 2, 3, 4].flatMap((divisionId, i) =>
	[0, 1, 2, 3].map((j) => ({ tid: i * 4 + j, divisionId })),
);

// Southland 2 needs 5 clubs: 1 automatic + 4 playoff
const pilotClubsBigEnough = [
	...pilotClubs,
	{ tid: 16, divisionId: 4 },
	{ tid: 17, divisionId: 4 },
];

describe("validateCompetitionStructure", () => {
	test("accepts the default structure and the 2x2 pilot", () => {
		expect(() =>
			validateCompetitionStructure(getDefaultCompetitionStructure()),
		).not.toThrow();
		expect(() => validateCompetitionStructure(pilot)).not.toThrow();
	});

	test("rejects duplicate or invalid ids", () => {
		expect(() =>
			validateCompetitionStructure({
				...pilot,
				countries: [pilot.countries[0], { countryId: 10, name: "Dupe" }],
			}),
		).toThrow(/Duplicate Country id 10/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				competitionDivisions: [
					...pilot.competitionDivisions,
					{ divisionId: 1, countryId: 20, tier: 3, name: "Dupe" },
				],
			}),
		).toThrow(/Duplicate Division id 1/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				promotionRelegationLinks: [
					pilot.promotionRelegationLinks[0]!,
					{ ...pilot.promotionRelegationLinks[1]!, id: 1 },
				],
			}),
		).toThrow(/Duplicate PromotionRelegationLink id 1/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				countries: [{ countryId: -1, name: "Bad" }],
			}),
		).toThrow(/non-negative integer/);
	});

	test("rejects Divisions in missing Countries, bad tiers, and gaps in a pyramid", () => {
		expect(() =>
			validateCompetitionStructure({
				...pilot,
				competitionDivisions: [
					...pilot.competitionDivisions,
					{ divisionId: 9, countryId: 99, tier: 1, name: "Nowhere" },
				],
			}),
		).toThrow(/Country 99, which doesn't exist/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				competitionDivisions: [
					{ divisionId: 1, countryId: 10, tier: 0, name: "Zero" },
				],
			}),
		).toThrow(/tier must be an integer >= 1/);

		expect(() =>
			validateCompetitionStructure({
				countries: [pilot.countries[0]],
				competitionDivisions: [
					{ divisionId: 1, countryId: 10, tier: 1, name: "One" },
					{ divisionId: 3, countryId: 10, tier: 3, name: "Three" },
				],
				promotionRelegationLinks: [],
			}),
		).toThrow(/tiers must start at 1 with no gaps/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				countries: [...pilot.countries, { countryId: 30, name: "Empty" }],
			}),
		).toThrow(/Country 30 has no Divisions/);
	});

	test("allows two Divisions on the same tier (regional groups)", () => {
		expect(() =>
			validateCompetitionStructure({
				countries: [pilot.countries[0]],
				competitionDivisions: [
					{ divisionId: 1, countryId: 10, tier: 1, name: "Top" },
					{ divisionId: 2, countryId: 10, tier: 2, name: "North" },
					{ divisionId: 3, countryId: 10, tier: 2, name: "South" },
				],
				promotionRelegationLinks: [],
			}),
		).not.toThrow();
	});

	test("rejects links that are unbalanced, cross Countries, skip tiers, or share a side", () => {
		const [northLink, southLink] = pilot.promotionRelegationLinks as [
			CompetitionStructure["promotionRelegationLinks"][number],
			CompetitionStructure["promotionRelegationLinks"][number],
		];

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				promotionRelegationLinks: [{ ...northLink, numAutoRelegated: 3 }],
			}),
		).toThrow(/unbalanced/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				promotionRelegationLinks: [{ ...northLink, lowerDivisionId: 99 }],
			}),
		).toThrow(/lower Division 99, which doesn't exist/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				promotionRelegationLinks: [{ ...northLink, lowerDivisionId: 4 }],
			}),
		).toThrow(
			/is for Country 10, but links Division 1 \(Country 10\) and Division 4 \(Country 20\)/,
		);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				promotionRelegationLinks: [
					{ ...northLink, upperDivisionId: 2, lowerDivisionId: 1 },
				],
			}),
		).toThrow(/must be exactly one tier below/);

		expect(() =>
			validateCompetitionStructure({
				...pilot,
				competitionDivisions: [
					...pilot.competitionDivisions,
					{ divisionId: 5, countryId: 10, tier: 2, name: "Northland 2 South" },
				],
				promotionRelegationLinks: [
					northLink,
					southLink,
					{ ...northLink, id: 3, lowerDivisionId: 5 },
				],
			}),
		).toThrow(/Division 1 is the upper Division of more than one/);
	});
});

describe("validateClubDivisions", () => {
	test("accepts every club in a real Division with enough clubs", () => {
		expect(() =>
			validateClubDivisions(pilot, pilotClubsBigEnough),
		).not.toThrow();
	});

	test("rejects clubs with no Division or a Division that doesn't exist", () => {
		expect(() =>
			validateClubDivisions(pilot, [
				...pilotClubsBigEnough,
				{ tid: 18 },
				{ tid: 19 },
			]),
		).toThrow(/don't have one: 18, 19/);

		expect(() =>
			validateClubDivisions(pilot, [
				...pilotClubsBigEnough,
				{ tid: 18, divisionId: 99 },
			]),
		).toThrow(/Team 18 has divisionId 99, which doesn't exist/);
	});

	test("rejects a Division with no active clubs", () => {
		expect(() =>
			validateClubDivisions(
				pilot,
				pilotClubsBigEnough.map((club) =>
					club.divisionId === 2 ? { ...club, disabled: true } : club,
				),
			),
		).toThrow(/Division 2 \(Northland 2\) has no active teams/);
	});

	test("rejects a Division too small for the clubs its links pick every season", () => {
		// Southland 2 has 4 clubs, but 1 automatic + 4 playoff = 5 are picked
		expect(() => validateClubDivisions(pilot, pilotClubs)).toThrow(
			/Division 4 \(Southland 2\) has 4 active team\(s\), but its promotion\/relegation rules pick 5/,
		);
	});
});

describe("getNewLeagueCompetition", () => {
	test("with nothing supplied, uses the default structure and puts every club in it", () => {
		const { structure, divisionIdByTid } = getNewLeagueCompetition({}, [
			{ tid: 0 },
			{ tid: 1 },
			{ tid: 2, divisionId: DEFAULT_DIVISION_ID },
		]);

		expect(structure).toEqual(getDefaultCompetitionStructure());
		expect([...divisionIdByTid]).toEqual([
			[0, DEFAULT_DIVISION_ID],
			[1, DEFAULT_DIVISION_ID],
			[2, DEFAULT_DIVISION_ID],
		]);
	});

	test("with nothing supplied, rejects clubs pointing at other Divisions", () => {
		expect(() =>
			getNewLeagueCompetition({}, [{ tid: 0, divisionId: 5 }]),
		).toThrow(/no competitionDivisions were provided/);
	});

	test("rejects half a structure", () => {
		expect(() =>
			getNewLeagueCompetition({ countries: pilot.countries }, []),
		).toThrow(/must be provided together/);
		expect(() =>
			getNewLeagueCompetition(
				{ promotionRelegationLinks: pilot.promotionRelegationLinks },
				[],
			),
		).toThrow(/without countries and competitionDivisions/);
	});

	test("with a structure supplied, validates it and keeps each club's Division", () => {
		const { structure, divisionIdByTid } = getNewLeagueCompetition(
			pilot,
			pilotClubsBigEnough,
		);

		expect(structure).toEqual(pilot);
		expect(divisionIdByTid.get(0)).toBe(1);
		expect(divisionIdByTid.get(17)).toBe(4);

		expect(() =>
			getNewLeagueCompetition(pilot, [...pilotClubsBigEnough, { tid: 18 }]),
		).toThrow(/don't have one: 18/);
	});

	test("defaults promotionRelegationLinks to none", () => {
		const { structure } = getNewLeagueCompetition(
			{
				countries: pilot.countries,
				competitionDivisions: pilot.competitionDivisions,
			},
			pilotClubs,
		);
		expect(structure.promotionRelegationLinks).toEqual([]);
	});

	test("a single-Division structure takes clubs with no divisionId", () => {
		const { divisionIdByTid } = getNewLeagueCompetition(
			{
				countries: [{ countryId: 3, name: "Solo" }],
				competitionDivisions: [
					{ divisionId: 7, countryId: 3, tier: 1, name: "Solo League" },
				],
			},
			[{ tid: 0 }, { tid: 1, divisionId: 7 }],
		);

		expect([...divisionIdByTid]).toEqual([
			[0, 7],
			[1, 7],
		]);
	});
});

describe("getWorldSeasonLength", () => {
	const withNumGames = (numGames: (number | undefined)[]) =>
		({
			...pilot,
			competitionDivisions: pilot.competitionDivisions.map((division, i) => ({
				...division,
				numGames: numGames[i],
			})),
		}) as CompetitionStructure;

	test("is the most common Division season length, the longest if tied", () => {
		expect(getWorldSeasonLength(withNumGames([30, 30, 22, 30]))).toBe(30);
		expect(getWorldSeasonLength(withNumGames([22, 30, 22, 30]))).toBe(30);
		expect(getWorldSeasonLength(withNumGames([22, undefined, 22, 30]))).toBe(
			22,
		);
	});

	test("is undefined when no Division sets one", () => {
		expect(getWorldSeasonLength(pilot)).toBeUndefined();
	});
});

describe("getLegacyConfsDivs", () => {
	test("one conference per Country, one division per Division, ordered by Country then tier", () => {
		const { confs, divs, confDivByDivisionId } = getLegacyConfsDivs(pilot);

		expect(confs).toEqual([
			{ cid: 0, name: "Northland", abbrev: "NOR" },
			{ cid: 1, name: "Southland" },
		]);
		expect(divs).toEqual([
			{ cid: 0, did: 0, name: "Northland 1", abbrev: "N1" },
			{ cid: 0, did: 1, name: "Northland 2" },
			{ cid: 1, did: 2, name: "Southland 1" },
			{ cid: 1, did: 3, name: "Southland 2" },
		]);
		expect(confDivByDivisionId.get(1)).toEqual({ cid: 0, did: 0 });
		expect(confDivByDivisionId.get(2)).toEqual({ cid: 0, did: 1 });
		expect(confDivByDivisionId.get(3)).toEqual({ cid: 1, did: 2 });
		expect(confDivByDivisionId.get(4)).toEqual({ cid: 1, did: 3 });
	});
});

describe("getDivisionIdForNewClub", () => {
	test("uses the requested Division if it exists", () => {
		expect(getDivisionIdForNewClub(pilot, { divisionId: 3, did: 0 })).toBe(3);
	});

	test("a single-Division World only has one choice", () => {
		expect(
			getDivisionIdForNewClub(getDefaultCompetitionStructure(), {
				divisionId: 99,
				did: 4,
			}),
		).toBe(DEFAULT_DIVISION_ID);
	});

	test("maps a ZenGM did to the Division it mirrors", () => {
		// See getLegacyConfsDivs: did 1 is Northland 2, did 3 is Southland 2
		expect(getDivisionIdForNewClub(pilot, { did: 3 })).toBe(4);
		expect(getDivisionIdForNewClub(pilot, { divisionId: 99, did: 1 })).toBe(2);
	});

	test("otherwise starts at the bottom tier of the first Country", () => {
		expect(getDivisionIdForNewClub(pilot, {})).toBe(2);
		expect(getDivisionIdForNewClub(pilot, { did: 99 })).toBe(2);
	});
});

describe("validateCompetitionStructure: Division settings", () => {
	test("accepts a season length and table points", () => {
		expect(() =>
			validateCompetitionStructure({
				...pilot,
				competitionDivisions: pilot.competitionDivisions.map((division) => ({
					...division,
					numGames: 38,
					winPoints: 3,
					tiePoints: 1,
					lossPoints: 0,
				})) as CompetitionStructure["competitionDivisions"],
			}),
		).not.toThrow();
	});

	test.each(["numGames", "winPoints", "tiePoints", "lossPoints"] as const)(
		"rejects a negative or fractional %s",
		(key) => {
			for (const value of [-1, 2.5]) {
				expect(() =>
					validateCompetitionStructure({
						...pilot,
						competitionDivisions: [
							{ ...pilot.competitionDivisions[0], [key]: value },
							...pilot.competitionDivisions.slice(1),
						],
					}),
				).toThrow(`Division 1: ${key} must be a non-negative integer`);
			}
		},
	);
});
