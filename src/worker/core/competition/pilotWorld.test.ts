import { describe, expect, test } from "vitest";
import {
	validateClubDivisions,
	validateCompetitionStructure,
} from "./competitionStructure.ts";
import {
	generatePilotWorld,
	generateWorld,
	makeAbbrev,
	MAX_CLUBS_PER_DIVISION,
	PILOT_CLUBS_PER_DIVISION,
	repeatsWord,
} from "./pilotWorld.ts";
import { WORLD_COUNTRIES } from "./worldCountries.ts";
import { isRealClubName } from "./pilotTowns.ts";

// The same numbers every time, for a repeatable World
const seededRandom = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
};

const fullName = (club: { region: string; name: string }) =>
	`${club.region} ${club.name}`;

describe("generatePilotWorld", () => {
	test("the United Kingdom and Spain, each with two tiers of 16 clubs and promotion and relegation between them", () => {
		const { structure, clubs } = generatePilotWorld(seededRandom(1));

		expect(() => validateCompetitionStructure(structure)).not.toThrow();
		expect(() => validateClubDivisions(structure, clubs)).not.toThrow();

		expect(structure.countries.map((country) => country.name)).toEqual([
			"United Kingdom",
			"Spain",
		]);
		expect(
			structure.competitionDivisions.map((division) => division.name),
		).toContain("British First Division");
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

	test("British players have English names, since ZenGM has no others for the UK", () => {
		const { structure } = generatePilotWorld(seededRandom(2));
		expect(structure.countries[0]!.nameCountries).toEqual([
			"England",
			"Scotland",
			"Wales",
			"Northern Ireland",
		]);
		expect(structure.countries[1]!.nameCountries).toBeUndefined();
	});

	test("every club is one of the first real clubs of its tier's list, in order, in its town, with its crest", () => {
		for (const clubsPerDivision of [10, PILOT_CLUBS_PER_DIVISION, 20]) {
			const { structure, clubs } = generateWorld({
				clubsPerDivision,
				random: seededRandom(clubsPerDivision),
			});

			for (const division of structure.competitionDivisions) {
				const country = structure.countries.find(
					(country) => country.countryId === division.countryId,
				)!;
				const worldCountry = WORLD_COUNTRIES.find(
					(c) => c.name === country.name,
				)!;
				const expected = worldCountry.realClubsByTier![
					division.tier - 1
				]!.slice(0, clubsPerDivision);
				const divisionClubs = clubs.filter(
					(club) => club.divisionId === division.divisionId,
				);

				expect(divisionClubs.map(fullName)).toEqual(expected.map(fullName));
				for (const [i, club] of divisionClubs.entries()) {
					const real = expected[i]!;
					const town = worldCountry.towns.find((t) => t.name === real.town)!;
					expect(club.abbrev).toBe(real.abbrev);
					expect(club.imgURL).toBe(real.imgURL);
					expect(club.colors).toEqual(real.colors);
					expect(club.location).toEqual({
						town: town.name,
						country: country.name,
						wikipedia: town.wikipedia,
					});
				}

				// The first clubs in the list are the biggest markets
				expect(divisionClubs[0]!.pop).toBeGreaterThan(
					divisionClubs.at(-1)!.pop,
				);
			}
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

	test("the same random numbers make the same World", () => {
		expect(generatePilotWorld(seededRandom(4))).toEqual(
			generatePilotWorld(seededRandom(4)),
		);
	});
});

describe("real clubs", () => {
	const countriesWithRealClubs = WORLD_COUNTRIES.filter(
		(country) => country.realClubsByTier,
	);
	const allRealClubs = countriesWithRealClubs.flatMap((country) =>
		country.realClubsByTier!.flat(),
	);

	test("every Country's tiers of real clubs fill its biggest Divisions, each club in one of its towns", () => {
		expect(countriesWithRealClubs.map((country) => country.key)).toEqual([
			"uk",
			"spain",
			"usa",
			"mexico",
			"germany",
			"japan",
		]);
		for (const country of countriesWithRealClubs) {
			expect(country.realClubsByTier!.length).toBeLessThanOrEqual(
				country.numTiers,
			);
			for (const tierClubs of country.realClubsByTier!) {
				expect(tierClubs).toHaveLength(MAX_CLUBS_PER_DIVISION);
				for (const club of tierClubs) {
					expect(
						country.towns.some((town) => town.name === club.town),
						`${fullName(club)} in ${club.town}`,
					).toBe(true);
				}
			}
		}
	});

	test("every real club has its own name and three letter abbreviation, colors, and a crest or logo path", () => {
		expect(new Set(allRealClubs.map((club) => club.abbrev)).size).toBe(
			allRealClubs.length,
		);
		expect(new Set(allRealClubs.map(fullName)).size).toBe(allRealClubs.length);
		for (const club of allRealClubs) {
			expect(club.abbrev).toMatch(/^[\dA-Z]{3}$/);
			expect(club.imgURL).toMatch(
				/^(\/img\/world-logos\/[a-z]+\/[\da-z-]+\.(svg|png)|data:image\/svg\+xml,.+)$/,
			);
			for (const color of club.colors) {
				expect(color).toMatch(/^#[\da-f]{6}$/);
			}
		}
		// The files themselves are checked in src/test/realClubLogos.test.ts
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
			"United Kingdom",
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
		expect(new Set(clubs.map(fullName)).size).toBe(clubs.length);
		expect(clubs.map((club) => club.tid)).toEqual(
			Array.from({ length: clubs.length }, (_, i) => i),
		);
	});

	test("every Country's clubs are in its towns, and generated clubs don't copy real clubs", () => {
		for (let seed = 1; seed <= 5; seed++) {
			const { structure, clubs } = generateWorld({
				countryKeys: allCountryKeys,
				random: seededRandom(seed),
			});
			for (const country of structure.countries) {
				const worldCountry = WORLD_COUNTRIES.find(
					(c) => c.name === country.name,
				)!;
				const realNames = new Set(
					(worldCountry.realClubsByTier ?? []).flat().map(fullName),
				);
				for (const club of clubs.filter(
					(club) => club.cid === country.countryId,
				)) {
					expect(
						worldCountry.towns.some((town) => town.name === club.location.town),
					).toBe(true);
					// A real club is meant to be a real club
					if (realNames.has(fullName(club))) {
						continue;
					}
					expect(
						isRealClubName(fullName(club), worldCountry.realClubNames),
					).toBe(false);
					expect(repeatsWord(club.region, club.name), fullName(club)).toBe(
						false,
					);
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

describe("the USA's real clubs", () => {
	const usa = WORLD_COUNTRIES.find((country) => country.key === "usa")!;
	const realClubs = usa.realClubsByTier![0]!;
	const byName = new Map(realClubs.map((club) => [fullName(club), club]));

	test("every tier is real clubs, from that tier's list, with the top tier's picked-first clubs first", () => {
		expect(usa.realClubsByTier).toHaveLength(usa.numTiers);
		expect(usa.realClubsInOrder).toBeUndefined();
		for (const clubsPerDivision of [10, 16, 20]) {
			const { structure, clubs } = generateWorld({
				countryKeys: ["usa"],
				clubsPerDivision,
				random: seededRandom(clubsPerDivision + 100),
			});
			for (const division of structure.competitionDivisions) {
				const tierNames = new Set(
					usa.realClubsByTier![division.tier - 1]!.map(fullName),
				);
				const divisionClubs = clubs.filter(
					(club) => club.divisionId === division.divisionId,
				);
				expect(divisionClubs).toHaveLength(clubsPerDivision);
				for (const club of divisionClubs) {
					expect(tierNames.has(fullName(club)), fullName(club)).toBe(true);
				}
			}
		}
	});

	test("a USA World's top tier is made of them, clubs picked first first", () => {
		const numPickFirst = realClubs.filter((club) => club.pickFirst).length;
		for (const clubsPerDivision of [10, 16, 20]) {
			const { structure, clubs } = generateWorld({
				countryKeys: ["usa"],
				clubsPerDivision,
				random: seededRandom(clubsPerDivision),
			});
			expect(() => validateClubDivisions(structure, clubs)).not.toThrow();

			const topDivisionId = structure.competitionDivisions.find(
				(division) => division.tier === 1,
			)!.divisionId;
			const topClubs = clubs.filter(
				(club) => club.divisionId === topDivisionId,
			);
			expect(topClubs).toHaveLength(clubsPerDivision);
			for (const club of topClubs) {
				const real = byName.get(fullName(club));
				expect(real, fullName(club)).toBeDefined();
				expect(club.abbrev).toBe(real!.abbrev);
				expect(club.imgURL).toBe(real!.imgURL);
				expect(club.colors).toEqual(real!.colors);
				expect(club.location.town).toBe(real!.town);
			}
			expect(
				topClubs.filter((club) => byName.get(fullName(club))!.pickFirst),
			).toHaveLength(Math.min(clubsPerDivision, numPickFirst));

			expect(new Set(clubs.map((club) => club.abbrev)).size).toBe(clubs.length);
		}
	});
});

describe("repeatsWord", () => {
	test("catches a name repeating a word of its region, ignoring case", () => {
		expect(repeatsWord("Oklahoma City", "City")).toBe(true);
		expect(repeatsWord("Salt Lake City", "city fc")).toBe(true);
		expect(repeatsWord("Oklahoma City", "FC")).toBe(false);
		expect(repeatsWord("Atlético Huelva", "CF")).toBe(false);
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
