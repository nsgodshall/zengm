import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import { getDerbyTown, getRivalries, RIVALRY_SETTINGS } from "./rivalries.ts";

const entry = (
	season: number,
	divisionId: number,
	position: number,
	moved?: "promoted" | "relegated",
): WorldHistoryEntry => ({
	season,
	divisionId,
	tier: divisionId,
	position,
	numClubs: 4,
	pyramidPosition: position,
	points: 10,
	...(moved ? { moved } : {}),
});

describe("getRivalries", () => {
	test("clubs in the same town are derby rivals, and only within a Country", () => {
		const rivals = getRivalries({
			season: 2030,
			clubs: [
				{ tid: 0, countryId: 0, town: "Madrid", history: [] },
				{ tid: 1, countryId: 0, town: "Madrid", history: [] },
				{ tid: 2, countryId: 1, town: "Madrid", history: [] },
				{ tid: 3, countryId: 0, town: "Sevilla", history: [] },
			],
		});
		expect(rivals.get(0)!.map((rival) => rival.tid)).toEqual([1]);
		expect(getDerbyTown(rivals.get(0)![0]!)).toBe("Madrid");
		expect(rivals.has(2)).toBe(false);
		expect(rivals.has(3)).toBe(false);
	});

	test("title races, going up or down together, and playoff meetings build rivalries that fade", () => {
		const clubs = [
			{
				tid: 0,
				countryId: 0,
				history: [entry(2030, 1, 1), entry(2031, 1, 2), entry(2032, 1, 1)],
			},
			{
				tid: 1,
				countryId: 0,
				history: [entry(2030, 1, 2), entry(2031, 1, 1), entry(2032, 1, 3)],
			},
			{
				tid: 2,
				countryId: 0,
				history: [
					entry(2030, 2, 1, "promoted"),
					entry(2031, 1, 4, "relegated"),
				],
			},
			{
				tid: 3,
				countryId: 0,
				history: [
					entry(2030, 2, 2, "promoted"),
					entry(2031, 1, 3, "relegated"),
				],
			},
		];
		const rivals = getRivalries({
			season: 2032,
			clubs,
			playoffGames: [{ season: 2032, homeTid: 2, awayTid: 3 }],
		});

		const decay = RIVALRY_SETTINGS.decay;
		const [rival] = rivals.get(0)!;
		expect(rival!.tid).toBe(1);
		expect(rival!.score).toBeCloseTo(
			RIVALRY_SETTINGS.titleRace * (decay ** 2 + decay),
		);
		expect(rival!.reasons).toEqual([
			{ kind: "titleRace", season: 2030 },
			{ kind: "titleRace", season: 2031 },
		]);

		// First and second in the second tier, then up together, down together,
		// and a playoff meeting
		expect(rivals.get(2)![0]!.score).toBeCloseTo(
			RIVALRY_SETTINGS.titleRace * decay ** 2 +
				RIVALRY_SETTINGS.movedTogether * (decay ** 2 + decay) +
				RIVALRY_SETTINGS.playoffMeeting,
		);

		// Nothing counts after the season asked about
		expect(getRivalries({ season: 2029, clubs }).get(0)).toBe(undefined);
		expect(getRivalries({ season: 2030, clubs }).get(0)![0]!.score).toBe(
			RIVALRY_SETTINGS.titleRace,
		);
	});
});
