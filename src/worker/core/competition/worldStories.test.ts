import { describe, expect, test } from "vitest";
import type {
	WorldHistoryEntry,
	WorldSeasonRuns,
} from "../../../common/types.ts";
import {
	detectCountryStories,
	type WorldStoryClub,
	writeWorldStory,
} from "./worldStories.ts";

const divisions = [
	{ divisionId: 1, countryId: 0, tier: 1, name: "First Division" },
	{ divisionId: 2, countryId: 0, tier: 2, name: "Second Division" },
	{ divisionId: 3, countryId: 0, tier: 3, name: "Third Division" },
];

// A season entry: tier.position, points, and C (champion), U (promoted), or D
// (relegated)
const entry = (
	season: number,
	code: string,
	points = 50,
): WorldHistoryEntry => {
	const [tier, position] = code.split(/[A-Z]/)[0]!.split(".").map(Number);
	return {
		season,
		divisionId: tier!,
		tier: tier!,
		position: position!,
		numClubs: 4,
		pyramidPosition: (tier! - 1) * 4 + position!,
		points,
		...(code.includes("C") ? { champion: true } : {}),
		...(code.includes("U") ? { moved: "promoted" as const } : {}),
		...(code.includes("D") ? { moved: "relegated" as const } : {}),
	};
};

const club = (
	tid: number,
	statureBefore: number,
	codes: string[],
	extra: Partial<WorldStoryClub> = {},
): WorldStoryClub => ({
	tid,
	countryId: 0,
	statureBefore,
	history: codes.map((code, i) => {
		const [c, points] = code.split("/");
		return entry(2030 + i, c!, points === undefined ? 50 : Number(points));
	}),
	...extra,
});

const detect = (clubs: WorldStoryClub[], season: number) =>
	detectCountryStories({ season, countryId: 0, divisions, clubs });

const name = (tid: number) => `Club ${tid}`;

describe("detectCountryStories", () => {
	test("a third title in 5 seasons starts a dynasty, won by a big club in a close race", () => {
		const stories = detect(
			[
				club(0, 80, ["1.1C/60", "1.2/55", "1.1C/58", "1.1C/61"]),
				club(1, 70, ["1.2/55", "1.1C/58", "1.2/57", "1.2/59"]),
				club(2, 50, ["1.3", "1.3", "1.3", "1.3"]),
				club(3, 40, ["1.4D", "2.1CU", "1.4D", "2.1CU"]),
			],
			2033,
		);
		expect(stories.map((story) => story.kind)).toEqual([
			"dynasty",
			"titleRace",
			"titleDefended",
		]);
		expect(writeWorldStory(stories[2]!, name)).toBe(
			"Club 0 kept their First Division title.",
		);
		expect(writeWorldStory(stories[0]!, name)).toBe(
			"A dynasty: Club 0 have won 3 First Division titles in 4 seasons.",
		);
		expect(writeWorldStory(stories[1]!, name)).toBe(
			"Club 0 won the First Division by 2 points from Club 1.",
		);
	});

	test("a smaller club's title breaks the big clubs' grip, and a giant falls", () => {
		const stories = detect(
			[
				club(0, 90, ["1.4D"]),
				club(1, 80, ["1.2"]),
				club(2, 75, ["1.3"]),
				club(3, 30, ["1.1C/70"]),
			],
			2030,
		);
		expect(stories.map((story) => story.kind)).toEqual([
			"fallenGiant",
			"challengerTitle",
		]);
		expect(writeWorldStory(stories[1]!, name)).toBe(
			"Club 3 broke the big clubs' grip on the First Division, finishing ahead of Club 0, Club 1, and Club 2.",
		);
	});

	test("a title race between clubs from the same town is a derby", () => {
		const [race] = detect(
			[
				club(0, 80, ["1.1C/60"], { town: "Madrid" }),
				club(1, 70, ["1.2/60"], { town: "Madrid" }),
			],
			2030,
		).filter((story) => story.kind === "titleRace");
		expect(writeWorldStory(race!, name)).toBe(
			"Club 0 won the First Division on tiebreakers, level on points with their Madrid rivals Club 1.",
		);
	});

	test("titles in a row, and champions who were only just promoted", () => {
		const threeInARow = detect([club(0, 80, ["1.1C", "1.1C", "1.1C"])], 2032);
		expect(
			writeWorldStory(
				threeInARow.find((story) => story.kind === "titleDefended")!,
				name,
			),
		).toBe(
			"Club 0 are First Division champions for the third season in a row.",
		);

		const promoted = detect(
			[club(0, 40, ["2.1CU", "1.1C"]), club(1, 50, ["1.2", "1.2"])],
			2031,
		);
		expect(promoted.map((story) => story.kind)).toContain("promotedChampions");
	});

	test("the end of an era comes two seasons after a dynasty's last title", () => {
		const dynastyClub = club(0, 80, ["1.1C", "1.1C", "1.1C", "1.2", "1.3"]);
		expect(
			detect([dynastyClub], 2034).find((story) => story.kind === "endOfEra")
				?.facts,
		).toEqual({ titles: 3, from: 2030, to: 2032 });
		expect(
			detect([dynastyClub], 2033).some((story) => story.kind === "endOfEra"),
		).toBe(false);
	});

	test("climbs, yo-yo clubs, and records", () => {
		const climber = club(0, 30, ["3.1CU", "2.1CU"]);
		const [climb] = detect(
			[climber, club(1, 50, ["1.1C", "1.1C"])],
			2031,
		).filter((story) => story.kind === "climb");
		expect(writeWorldStory(climb!, name)).toBe(
			"Club 0 have climbed from the Third Division to the top flight in 2 seasons.",
		);

		const yoYo = club(0, 40, ["2.1U", "1.4D", "2.1U", "1.4D", "2.2U", "1.4D"]);
		expect(
			detect([yoYo], 2035).filter((story) => story.kind === "yoYo").length,
		).toBe(1);
		// The season it became one, not every season after
		expect(
			detect(
				[club(0, 40, ["2.1U", "1.4D", "2.1U", "1.4D", "2.2U", "1.4D", "2.1U"])],
				2036,
			).filter((story) => story.kind === "yoYo").length,
		).toBe(0);

		const history = ["1.1C/60", "1.1C/61", "1.1C/59", "1.1C/62", "1.1C/58"];
		const records = detect(
			[
				club(0, 80, [...history, "1.1C/70"]),
				club(1, 60, [
					"1.4/20",
					"1.4/21",
					"1.4/22",
					"1.4/23",
					"1.4/24",
					"1.4D/12",
				]),
			],
			2035,
		);
		expect(records.map((story) => story.kind).sort()).toEqual([
			"fewestPoints",
			"recordPoints",
			"titleDefended",
		]);
	});

	test("unbeaten and winless seasons come from the season's runs", () => {
		const runs = (longest: Partial<WorldSeasonRuns>): WorldSeasonRuns => ({
			winning: 0,
			unbeaten: 0,
			losing: 0,
			winless: 0,
			longestWinning: 0,
			longestUnbeaten: 0,
			longestLosing: 0,
			longestWinless: 0,
			...longest,
		});
		const stories = detect(
			[
				club(0, 60, ["1.1C"], {
					runs: runs({ longestWinning: 30, longestUnbeaten: 30 }),
				}),
				club(1, 60, ["1.4D"], {
					runs: runs({ longestLosing: 30, longestWinless: 30 }),
				}),
				club(2, 60, ["1.2"], {
					runs: runs({
						longestWinning: 4,
						longestUnbeaten: 6,
						longestLosing: 2,
					}),
				}),
			],
			2030,
		);
		expect(
			stories
				.filter(
					(story) => story.kind === "unbeaten" || story.kind === "winless",
				)
				.map((story) => [story.kind, story.tids[0]]),
		).toEqual([
			["unbeaten", 0],
			["winless", 1],
		]);
	});
});
