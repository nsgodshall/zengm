import { describe, expect, test } from "vitest";
import type { Country, Division } from "../../../common/types.ts";
import {
	getCountryNameByTid,
	getNumLocalPlayers,
	LOCAL_PLAYER_FRACTION,
} from "./nationality.ts";

describe("getNumLocalPlayers", () => {
	test("rounds the local share of a group down or up at random", () => {
		expect(LOCAL_PLAYER_FRACTION).toBe(0.7);

		// 14 * 0.7 = 9.8
		expect(getNumLocalPlayers(14, () => 0.79)).toBe(10);
		expect(getNumLocalPlayers(14, () => 0.81)).toBe(9);

		// 10 * 0.7 = 7 exactly
		expect(getNumLocalPlayers(10, () => 0)).toBe(7);
		expect(getNumLocalPlayers(10, () => 0.99)).toBe(7);
	});

	test("a lone academy prospect is local 70% of the time", () => {
		expect(getNumLocalPlayers(1, () => 0.69)).toBe(1);
		expect(getNumLocalPlayers(1, () => 0.71)).toBe(0);
		expect(getNumLocalPlayers(0, () => 0)).toBe(0);
	});
});

describe("getCountryNameByTid", () => {
	const countries: Country[] = [
		{ countryId: 0, name: "England" },
		{ countryId: 1, name: "Spain" },
	];
	const competitionDivisions: Division[] = [
		{ divisionId: 0, countryId: 0, tier: 1, name: "English First Division" },
		{ divisionId: 1, countryId: 0, tier: 2, name: "English Second Division" },
		{ divisionId: 2, countryId: 1, tier: 1, name: "Spanish First Division" },
	];

	test("finds each club's Country through its Division", () => {
		const countryNameByTid = getCountryNameByTid({
			countries,
			competitionDivisions,
			teams: [
				{ tid: 0, divisionId: 0 },
				{ tid: 1, divisionId: 1 },
				{ tid: 2, divisionId: 2 },
			],
		});
		expect([...countryNameByTid.entries()]).toEqual([
			[0, "England"],
			[1, "England"],
			[2, "Spain"],
		]);
	});

	test("leaves out clubs without a known Division", () => {
		const countryNameByTid = getCountryNameByTid({
			countries,
			competitionDivisions,
			teams: [{ tid: 0 }, { tid: 1, divisionId: 7 }],
		});
		expect(countryNameByTid.size).toBe(0);
	});
});
