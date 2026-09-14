import { describe, expect, test } from "vitest";
import {
	ENGLISH_TOWNS,
	isRealClubName,
	normalizeClubName,
	REAL_ENGLISH_CLUB_NAMES,
	REAL_SPANISH_CLUB_NAMES,
	SPANISH_TOWNS,
} from "./pilotTowns.ts";

describe("town pools", () => {
	test("each Country has enough different towns for two Divisions of 16 clubs", () => {
		for (const towns of [ENGLISH_TOWNS, SPANISH_TOWNS]) {
			expect(towns.length).toBeGreaterThanOrEqual(48);
			expect(new Set(towns.map((town) => town.name)).size).toBe(towns.length);
			expect(
				new Set(towns.map((town) => town.clubName ?? town.name)).size,
			).toBe(towns.length);
		}
	});

	test("every town has a population and a Wikipedia article title", () => {
		for (const town of [...ENGLISH_TOWNS, ...SPANISH_TOWNS]) {
			expect(town.pop).toBeGreaterThan(0);
			expect(town.wikipedia).not.toContain(" ");
			expect(town.wikipedia.length).toBeGreaterThan(0);
		}
	});
});

describe("normalizeClubName", () => {
	test("ignores accents, capitals, hyphens, club types, and articles", () => {
		expect(normalizeClubName("Real Sporting de Gijón")).toBe(
			"real sporting gijon",
		);
		expect(normalizeClubName("Deportivo de La Coruña")).toBe(
			normalizeClubName("Deportivo A Coruña CF"),
		);
		expect(normalizeClubName("Brighton & Hove Albion")).toBe(
			normalizeClubName("Brighton and Hove Albion"),
		);
	});
});

describe("isRealClubName", () => {
	test("catches generated names that copy real clubs", () => {
		expect(isRealClubName("Stoke City", REAL_ENGLISH_CLUB_NAMES)).toBe(true);
		expect(isRealClubName("Manchester United", REAL_ENGLISH_CLUB_NAMES)).toBe(
			true,
		);
		expect(isRealClubName("Valencia CF", REAL_SPANISH_CLUB_NAMES)).toBe(true);
		expect(isRealClubName("Real Zaragoza FC", REAL_SPANISH_CLUB_NAMES)).toBe(
			true,
		);
		expect(isRealClubName("Atlético Madrid CF", REAL_SPANISH_CLUB_NAMES)).toBe(
			true,
		);
		expect(isRealClubName("Racing Santander FC", REAL_SPANISH_CLUB_NAMES)).toBe(
			true,
		);
	});

	test("allows invented names in the same towns", () => {
		expect(isRealClubName("Stoke Rovers", REAL_ENGLISH_CLUB_NAMES)).toBe(false);
		expect(isRealClubName("Manchester Athletic", REAL_ENGLISH_CLUB_NAMES)).toBe(
			false,
		);
		expect(
			isRealClubName("Deportivo Valencia CF", REAL_SPANISH_CLUB_NAMES),
		).toBe(false);
	});
});
