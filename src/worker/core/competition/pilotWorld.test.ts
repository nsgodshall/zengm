import { describe, expect, test } from "vitest";
import {
	validateClubDivisions,
	validateCompetitionStructure,
} from "./competitionStructure.ts";
import {
	generatePilotWorld,
	generateWorld,
	makeAbbrev,
	PILOT_CLUBS_PER_DIVISION,
} from "./pilotWorld.ts";
import { WORLD_COUNTRIES } from "./worldCountries.ts";
import {
	ENGLISH_TOWNS,
	isRealClubName,
	REAL_ENGLISH_CLUB_NAMES,
	REAL_SPANISH_CLUB_NAMES,
	SPANISH_TOWNS,
} from "./pilotTowns.ts";

// The same numbers every time, for a repeatable World
const seededRandom = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
};

describe("generatePilotWorld", () => {
	test("England and Spain, each with two tiers of 16 clubs and promotion and relegation between them", () => {
		const { structure, clubs } = generatePilotWorld(seededRandom(1));

		expect(() => validateCompetitionStructure(structure)).not.toThrow();
		expect(() => validateClubDivisions(structure, clubs)).not.toThrow();

		expect(structure.countries.map((country) => country.name)).toEqual([
			"England",
			"Spain",
		]);
		for (const division of structure.competitionDivisions) {
			expect(
				clubs.filter((club) => club.divisionId === division.divisionId),
			).toHaveLength(PILOT_CLUBS_PER_DIVISION);
			expect(division.numGames).toBe(30);
		}

		expect(structure.promotionRelegationLinks).toHaveLength(2);
		for (const link of structure.promotionRelegationLinks) {
			expect(link.numAutoPromoted).toBe(2);
			expect(link.numAutoRelegated).toBe(3);
			expect(link.numPromotionPlayoffTeams).toBe(4);
			expect(link.numPromotionPlayoffSpots).toBe(1);
		}

		expect(clubs.map((club) => club.tid)).toEqual(
			Array.from({ length: clubs.length }, (_, i) => i),
		);
	});

	test("every club has its own name and three letter abbreviation", () => {
		const { clubs } = generatePilotWorld(seededRandom(2));

		expect(
			new Set(clubs.map((club) => `${club.region} ${club.name}`)).size,
		).toBe(clubs.length);
		expect(new Set(clubs.map((club) => club.abbrev)).size).toBe(clubs.length);
		for (const club of clubs) {
			expect(club.abbrev).toMatch(/^[\dA-Z]{3}$/);

			// A generated crest with the club's abbreviation
			expect(club.imgURL.startsWith("data:image/svg+xml,")).toBe(true);
			expect(decodeURIComponent(club.imgURL)).toContain(
				`>${club.abbrev}</text>`,
			);
		}
	});

	test("top-tier clubs are bigger than second-tier clubs", () => {
		const { structure, clubs } = generatePilotWorld(seededRandom(3));

		for (const country of structure.countries) {
			const averagePop = (tier: number) => {
				const divisionId = structure.competitionDivisions.find(
					(division) =>
						division.countryId === country.countryId && division.tier === tier,
				)!.divisionId;
				const tierClubs = clubs.filter(
					(club) => club.divisionId === divisionId,
				);
				return (
					tierClubs.reduce((sum, club) => sum + club.pop, 0) / tierClubs.length
				);
			};
			expect(averagePop(1)).toBeGreaterThan(averagePop(2));
		}
	});

	test("clubs are in real towns, with names that don't copy real clubs", () => {
		for (let seed = 1; seed <= 20; seed++) {
			const { structure, clubs } = generatePilotWorld(seededRandom(seed));

			for (const country of structure.countries) {
				const english = country.name === "England";
				const pool = english ? ENGLISH_TOWNS : SPANISH_TOWNS;
				const realNames = english
					? REAL_ENGLISH_CLUB_NAMES
					: REAL_SPANISH_CLUB_NAMES;
				const countryClubs = clubs.filter(
					(club) => club.cid === country.countryId,
				);

				expect(
					new Set(countryClubs.map((club) => club.location.town)).size,
				).toBe(countryClubs.length);
				for (const club of countryClubs) {
					const town = pool.find((t) => t.name === club.location.town);
					expect(town).toBeDefined();
					expect(club.location).toEqual({
						town: town!.name,
						country: country.name,
						wikipedia: town!.wikipedia,
					});
					expect(isRealClubName(`${club.region} ${club.name}`, realNames)).toBe(
						false,
					);
				}

				// Bigger towns lean towards the top tier
				const averageTownPop = (tier: number) => {
					const divisionId = structure.competitionDivisions.find(
						(division) =>
							division.countryId === country.countryId &&
							division.tier === tier,
					)!.divisionId;
					const tierClubs = countryClubs.filter(
						(club) => club.divisionId === divisionId,
					);
					return (
						tierClubs.reduce(
							(sum, club) =>
								sum + pool.find((t) => t.name === club.location.town)!.pop,
							0,
						) / tierClubs.length
					);
				};
				expect(averageTownPop(1)).toBeGreaterThan(averageTownPop(2));
			}
		}
	});

	test("the same random numbers make the same World", () => {
		expect(generatePilotWorld(seededRandom(4))).toEqual(
			generatePilotWorld(seededRandom(4)),
		);
	});
});

describe("generateWorld", () => {
	const allCountryKeys = WORLD_COUNTRIES.map((country) => country.key);

	test("every Country together: the USA has 3 tiers, the rest 2", () => {
		const { structure, clubs } = generateWorld({
			countryKeys: allCountryKeys,
			random: seededRandom(6),
		});

		expect(() => validateCompetitionStructure(structure)).not.toThrow();
		expect(() => validateClubDivisions(structure, clubs)).not.toThrow();

		expect(structure.countries.map((country) => country.name)).toEqual([
			"England",
			"Spain",
			"USA",
			"Mexico",
			"Italy",
			"Germany",
			"Japan",
		]);
		for (const country of structure.countries) {
			const numTiers = structure.competitionDivisions.filter(
				(division) => division.countryId === country.countryId,
			).length;
			expect(numTiers).toBe(country.name === "USA" ? 3 : 2);
			expect(
				structure.promotionRelegationLinks.filter(
					(link) => link.countryId === country.countryId,
				),
			).toHaveLength(numTiers - 1);
		}
		expect(clubs).toHaveLength(15 * PILOT_CLUBS_PER_DIVISION);
		expect(
			structure.competitionDivisions.map((division) => division.name),
		).toContain("American Third Division");

		expect(new Set(clubs.map((club) => club.abbrev)).size).toBe(clubs.length);
		expect(
			new Set(clubs.map((club) => `${club.region} ${club.name}`)).size,
		).toBe(clubs.length);
		expect(clubs.map((club) => club.tid)).toEqual(
			Array.from({ length: clubs.length }, (_, i) => i),
		);
	});

	test("every Country's clubs are in its towns, with names that don't copy real clubs", () => {
		for (let seed = 1; seed <= 5; seed++) {
			const { structure, clubs } = generateWorld({
				countryKeys: allCountryKeys,
				random: seededRandom(seed),
			});
			for (const country of structure.countries) {
				const worldCountry = WORLD_COUNTRIES.find(
					(c) => c.name === country.name,
				)!;
				for (const club of clubs.filter(
					(club) => club.cid === country.countryId,
				)) {
					expect(
						worldCountry.towns.some((town) => town.name === club.location.town),
					).toBe(true);
					expect(
						isRealClubName(
							`${club.region} ${club.name}`,
							worldCountry.realClubNames,
						),
					).toBe(false);
				}
			}
		}
	});

	test("Divisions can have 10 to 20 clubs", () => {
		for (const clubsPerDivision of [10, 20]) {
			const { structure, clubs } = generateWorld({
				countryKeys: allCountryKeys,
				clubsPerDivision,
				random: seededRandom(7),
			});
			expect(() => validateClubDivisions(structure, clubs)).not.toThrow();
			expect(clubs).toHaveLength(15 * clubsPerDivision);
			for (const division of structure.competitionDivisions) {
				expect(division.numGames).toBe(2 * (clubsPerDivision - 1));
			}
		}

		expect(() => generateWorld({ clubsPerDivision: 9 })).toThrow();
		expect(() => generateWorld({ clubsPerDivision: 21 })).toThrow();
		expect(() => generateWorld({ countryKeys: [] })).toThrow();
	});

	test("it's basketball, so the USA starts strongest", () => {
		const { structure } = generateWorld({ countryKeys: allCountryKeys });
		const penaltyOf = (name: string) =>
			structure.countries.find((country) => country.name === name)!
				.startingStrengthPenalty!;
		for (const country of structure.countries) {
			expect(penaltyOf("USA")).toBeLessThanOrEqual(
				country.startingStrengthPenalty!,
			);
		}
		expect(penaltyOf("USA")).toBe(0);
	});
});

describe("makeAbbrev", () => {
	test("uses a town's first three letters, ignoring accents and spaces", () => {
		expect(makeAbbrev("Northport", new Set())).toBe("NOR");
		expect(makeAbbrev("Río del Mar", new Set())).toBe("RIO");
	});

	test("finds another abbreviation when that one is taken", () => {
		const taken = new Set<string>();
		expect(makeAbbrev("Northport", taken)).toBe("NOR");
		expect(makeAbbrev("Northwick", taken)).toBe("NOT");
		expect(taken).toEqual(new Set(["NOR", "NOT"]));
	});
});
