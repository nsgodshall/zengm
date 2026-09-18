import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import {
	FAN_EXPECTATION_SETTINGS,
	getFanExpectation,
} from "./fanExpectations.ts";

const entry = (
	season: number,
	tier: number,
	position: number,
	extra: Partial<WorldHistoryEntry> = {},
): WorldHistoryEntry => ({
	season,
	divisionId: tier,
	tier,
	position,
	numClubs: 20,
	pyramidPosition: (tier - 1) * 20 + position,
	points: 50,
	...extra,
});

const expectation = (history: WorldHistoryEntry[], tier = 1) =>
	getFanExpectation({
		history,
		tier,
		divisionName: tier === 1 ? "First Division" : "Second Division",
		topDivisionName: "First Division",
	});

describe("getFanExpectation", () => {
	test("has nothing to say about a club with no history", () => {
		expect(expectation([])).toBeUndefined();
	});

	test("expects champions to defend the title", () => {
		expect(expectation([entry(2030, 1, 1, { champion: true })])).toBe(
			"The fans expect the First Division title defended.",
		);
	});

	test("wants a relegated club straight back up", () => {
		expect(
			expectation([entry(2030, 1, 19, { moved: "relegated" })], 2),
		).toContain("straight back up");
	});

	test("says how long a promoted club waited to come back", () => {
		const history = [
			entry(2024, 1, 18, { moved: "relegated" }),
			...[2025, 2026, 2027, 2028, 2029].map((season) => entry(season, 2, 6)),
			entry(2030, 2, 1, { champion: true, moved: "promoted" }),
		];

		expect(expectation(history)).toBe(
			"Back in the First Division after 6 seasons away.",
		);
	});

	test("settles for staying up after a short spell down", () => {
		expect(
			expectation([
				entry(2029, 1, 19, { moved: "relegated" }),
				entry(2030, 2, 2, { moved: "promoted" }),
			]),
		).toContain("staying up");
	});

	test("counts the seasons a second-tier club has been away from the top", () => {
		const history = [
			entry(2020, 1, 17, { moved: "relegated" }),
			...[2021, 2022, 2023, 2024, 2025].map((season) => entry(season, 2, 8)),
		];

		expect(expectation(history, 2)).toBe(
			"6 seasons since the club was in the First Division.",
		);
	});

	test("counts a title drought in the top tier", () => {
		const history = [
			entry(2020, 1, 1, { champion: true }),
			...[2021, 2022, 2023, 2024, 2025].map((season) => entry(season, 1, 5)),
		];

		expect(expectation(history)).toBe("No title since 2020.");
	});

	test("says when a club has never won it, once it has a history", () => {
		const seasons = Array.from(
			{ length: FAN_EXPECTATION_SETTINGS.longWait },
			(_, i) => entry(2020 + i, 1, 7),
		);

		expect(expectation(seasons)).toBe(
			"The club has never won the First Division.",
		);
		expect(expectation(seasons.slice(0, 2))).toBeUndefined();
	});
});
