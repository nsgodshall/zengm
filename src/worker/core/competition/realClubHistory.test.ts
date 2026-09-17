import { describe, expect, test } from "vitest";
import {
	getLegacyForStature,
	getStature,
	STATURE_SETTINGS,
} from "./clubStature.ts";
import { getRealClubHistory, REAL_CLUB_HISTORY } from "./realClubHistory.ts";
import { WORLD_COUNTRIES } from "./worldCountries.ts";

describe("real clubs' history", () => {
	const realClubs = WORLD_COUNTRIES.flatMap(
		(country) => country.realClubsByTier?.flat() ?? [],
	);

	test("every real club has a starting stature, and nothing else does", () => {
		expect(realClubs.length).toBe(260);
		for (const club of realClubs) {
			const history = getRealClubHistory(club);
			expect(history, `${club.region} ${club.name}`).toBeDefined();
			expect(history!.stature).toBeGreaterThanOrEqual(0);
			expect(history!.stature).toBeLessThanOrEqual(100);
			if (history!.founded !== undefined) {
				expect(history!.founded).toBeGreaterThan(1800);
				expect(history!.founded).toBeLessThan(2026);
			}
		}
		expect(Object.keys(REAL_CLUB_HISTORY).sort()).toEqual(
			realClubs.map((club) => club.abbrev).sort(),
		);
	});

	test("a club sharing a real club's abbreviation isn't that club unless its region and name match too", () => {
		expect(
			getRealClubHistory({ abbrev: "MUN", region: "Munich", name: "FC" }),
		).toBe(undefined);
		// ZenGM's default Chicago team
		expect(
			getRealClubHistory({
				abbrev: "CHI",
				region: "Chicago",
				name: "Whirlwinds",
			}),
		).toBe(undefined);
		expect(
			getRealClubHistory({ abbrev: "CHI", region: "Chicago", name: "Bears" })
				?.stature,
		).toBe(82);
	});

	test("a starting stature turns into the legacy that gives it at a club's market size", () => {
		for (const pop of [0.3, 1, 4, 12, 25]) {
			for (const stature of [35, 60, 80, 95]) {
				const legacy = getLegacyForStature({ stature, pop });
				const actual = getStature({ legacy, pop });
				const marketOnly = getStature({ legacy: 0, pop });
				if (stature <= marketOnly) {
					// The market alone is already worth more
					expect(legacy).toBe(0);
				} else if (stature - marketOnly < STATURE_SETTINGS.legacyMax * 0.99) {
					expect(Math.abs(actual - stature)).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});
