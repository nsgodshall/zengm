import { describe, expect, test } from "vitest";
import {
	validateClubDivisions,
	validateCompetitionStructure,
} from "./competitionStructure.ts";
import {
	generatePilotWorld,
	makeAbbrev,
	PILOT_CLUBS_PER_DIVISION,
} from "./pilotWorld.ts";

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

	test("the same random numbers make the same World", () => {
		expect(generatePilotWorld(seededRandom(4))).toEqual(
			generatePilotWorld(seededRandom(4)),
		);
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
