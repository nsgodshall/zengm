import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import {
	getSeasonStorylines,
	type StorylineClub,
	writeStoryline,
} from "./seasonStorylines.ts";

const divisions = [
	{ divisionId: 1, countryId: 0, tier: 1, name: "First Division" },
	{ divisionId: 2, countryId: 0, tier: 2, name: "Second Division" },
];

// Finished seasons from 2030, as tier.position with C (champion), U
// (promoted), or D (relegated)
const history = (codes: string[]): WorldHistoryEntry[] =>
	codes.map((code, i) => {
		const [tier, position] = code.split(/[A-Z]/)[0]!.split(".").map(Number);
		return {
			season: 2030 + i,
			divisionId: tier!,
			tier: tier!,
			position: position!,
			numClubs: 4,
			pyramidPosition: position!,
			points: 10,
			...(code.includes("C") ? { champion: true } : {}),
			...(code.includes("U") ? { moved: "promoted" as const } : {}),
			...(code.includes("D") ? { moved: "relegated" as const } : {}),
		};
	});

const club = (
	tid: number,
	tier: number,
	codes: string[],
	extra: Partial<StorylineClub> = {},
): StorylineClub => ({
	tid,
	countryId: 0,
	divisionId: tier,
	tier,
	stature: 40,
	ovr: 50,
	history: history(codes),
	...extra,
});

const tell = (clubs: StorylineClub[], season: number) =>
	getSeasonStorylines({ season, countryId: 0, divisions, clubs }).map(
		(storyline) => writeStoryline(storyline, (tid) => `Club ${tid}`),
	);

describe("getSeasonStorylines", () => {
	test("the champions go for titles in a row, and the strongest squads are named", () => {
		expect(
			tell(
				[
					club(0, 1, ["1.1C", "1.1C"], { ovr: 60 }),
					club(1, 1, ["1.2", "1.2"], { ovr: 70 }),
					club(2, 1, ["1.3", "1.3"], { ovr: 40 }),
				],
				2032,
			),
		).toEqual([
			"Club 0 go for a record third First Division title in a row.",
			"The strongest squads in the First Division: Club 1, Club 0, Club 2.",
		]);
		expect(tell([club(0, 1, ["1.2", "1.1C"])], 2032)[0]).toBe(
			"Club 0 defend their First Division title.",
		);
	});

	test("promoted clubs, sleeping giants, and derbies", () => {
		const lines = tell(
			[
				club(0, 1, ["1.4D", "2.1CU"], { town: "Madrid" }),
				club(1, 1, ["1.1C", "1.1C"], { town: "Madrid" }),
				club(2, 1, ["1.2D", "2.1U", "1.5", "1.4D", "2.2", "2.1U"]),
				club(3, 2, ["1.3", "1.3", "1.3", "1.3", "1.3", "1.4D"], {
					stature: 75,
				}),
			],
			2036,
		);
		expect(lines).toContain(
			"Club 2 are back in the First Division after 2 seasons away.",
		);
		expect(lines).toContain(
			"Club 3 start life in the Second Division after relegation.",
		);
		expect(lines).not.toContain(
			"Club 0 are back in the First Division at the first attempt.",
		);

		expect(
			tell(
				[
					club(0, 1, ["1.4D", "2.1CU"], { town: "Madrid" }),
					club(1, 1, ["1.1C", "1.1C"], { town: "Madrid" }),
				],
				2032,
			),
		).toEqual([
			"Club 1 go for a record third First Division title in a row.",
			"The strongest squads in the First Division: Club 0, Club 1.",
			"Club 0 are back in the First Division at the first attempt.",
			"The Madrid derby is back in the First Division: Club 0 and Club 1.",
		]);
	});
});
