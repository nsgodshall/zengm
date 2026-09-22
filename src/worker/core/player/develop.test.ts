import { describe, expect, test } from "vitest";
import type { MinimalPlayerRatings } from "../../../common/types.ts";
import { applyDevelopmentModifiers } from "./develop.ts";

describe("applyDevelopmentModifiers", () => {
	test("scales gains and losses without changing summary fields", () => {
		const before = {
			season: 2026,
			fuzz: 0,
			ovr: 50,
			pot: 60,
			hgt: 50,
			spd: 50,
		} as MinimalPlayerRatings;
		const ratings = {
			...before,
			ovr: 55,
			hgt: 60,
			spd: 40,
		} as MinimalPlayerRatings;

		applyDevelopmentModifiers(ratings, before, {
			positiveFactor: 1.2,
			negativeFactor: 0.5,
		});

		expect(ratings.hgt).toBe(62);
		expect(ratings.spd).toBe(45);
		expect(ratings.ovr).toBe(55);
	});
});
