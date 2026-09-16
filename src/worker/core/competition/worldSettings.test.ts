import { describe, expect, test } from "vitest";
import {
	getStadiumCapacity,
	MAX_STADIUM_CAPACITY,
	MIN_STADIUM_CAPACITY,
	WORLD_MAX_ROSTER_SIZE,
	WORLD_MIN_ROSTER_SIZE,
} from "./worldSettings.ts";

describe("WORLD_MAX_ROSTER_SIZE", () => {
	test("is bigger than ZenGM's basketball roster limit of 15", () => {
		expect(WORLD_MAX_ROSTER_SIZE).toBe(18);
	});
});

describe("WORLD_MIN_ROSTER_SIZE", () => {
	test("keeps a modest lower-tier squad without filling every roster place", () => {
		expect(WORLD_MIN_ROSTER_SIZE).toBe(14);
		expect(WORLD_MIN_ROSTER_SIZE).toBeLessThan(WORLD_MAX_ROSTER_SIZE);
	});
});

describe("getStadiumCapacity", () => {
	test("grows with market size, rounded to the nearest 500", () => {
		expect(getStadiumCapacity(0.4)).toBe(11_500);
		expect(getStadiumCapacity(1.03)).toBe(17_500);
		expect(getStadiumCapacity(2)).toBe(26_000);
		expect(getStadiumCapacity(8)).toBe(80_000);
	});

	test("stays between the smallest and biggest stadiums", () => {
		expect(MIN_STADIUM_CAPACITY).toBe(10_000);
		expect(MAX_STADIUM_CAPACITY).toBe(80_000);
		expect(getStadiumCapacity(0)).toBe(MIN_STADIUM_CAPACITY);
		expect(getStadiumCapacity(20)).toBe(MAX_STADIUM_CAPACITY);
	});
});
