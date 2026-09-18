import { describe, expect, test } from "vitest";
import {
	couldBeALegend,
	describeRetirement,
	getRetirementStory,
	RETIREMENT_STORY_SETTINGS,
	type RetiringPlayer,
} from "./retirementStories.ts";

const player = (overrides: Partial<RetiringPlayer> = {}): RetiringPlayer => ({
	pid: 1,
	name: "Sam Smith",
	age: 35,
	byTid: [
		{ tid: 4, gp: 300, value: 2000, firstSeason: 2026, lastSeason: 2038 },
	],
	statsTids: [4],
	academyTids: [],
	...overrides,
});

const club = (overrides = {}) => ({
	mostAppearances: 400,
	mostScoring: 5000,
	titleSeasons: [],
	...overrides,
});

describe("getRetirementStory", () => {
	test("remembers a player at the club he played the most for", () => {
		const facts = getRetirementStory({
			player: player({
				byTid: [
					{ tid: 4, gp: 80, value: 400, firstSeason: 2026, lastSeason: 2029 },
					{ tid: 7, gp: 200, value: 900, firstSeason: 2030, lastSeason: 2038 },
				],
				statsTids: [4, 7],
			}),
			club: club(),
		});

		expect(facts?.tid).toBe(7);
		expect(facts?.gp).toBe(200);
		expect(facts?.oneClub).toBe(false);
	});

	test("passes over a player who was nobody's legend", () => {
		expect(
			getRetirementStory({
				player: player({
					byTid: [
						{ tid: 4, gp: 60, value: 100, firstSeason: 2036, lastSeason: 2038 },
					],
				}),
				club: club(),
			}),
		).toBeUndefined();
	});

	test("asks less of a one-club player and of an academy graduate", () => {
		const gp = RETIREMENT_STORY_SETTINGS.oneClubAppearances;
		const byTid = [
			{ tid: 4, gp, value: 300, firstSeason: 2030, lastSeason: 2038 },
		];

		expect(
			getRetirementStory({ player: player({ byTid }), club: club() })?.oneClub,
		).toBe(true);
		expect(
			getRetirementStory({
				player: player({ byTid, statsTids: [4, 9] }),
				club: club(),
			}),
		).toBeUndefined();
		expect(
			getRetirementStory({
				player: player({
					byTid: [
						{ ...byTid[0]!, gp: RETIREMENT_STORY_SETTINGS.academyAppearances },
					],
					statsTids: [4, 9],
					academyTids: [4],
				}),
				club: club(),
			})?.academy,
		).toBe(true);
	});

	test("tells the story of a club's all-time leader however long he stayed", () => {
		const facts = getRetirementStory({
			player: player({
				byTid: [
					{ tid: 4, gp: 90, value: 700, firstSeason: 2034, lastSeason: 2038 },
				],
				statsTids: [4, 9],
			}),
			club: club({ mostAppearances: 90, mostScoring: 700 }),
		});

		expect(facts?.leader).toEqual(["appearances", "scoring"]);
	});

	test("doesn't crown a leader on a handful of games", () => {
		expect(
			getRetirementStory({
				player: player({
					byTid: [
						{ tid: 4, gp: 5, value: 20, firstSeason: 2038, lastSeason: 2038 },
					],
					statsTids: [4, 9],
				}),
				club: club({ mostAppearances: 5, mostScoring: 20 }),
			}),
		).toBeUndefined();
	});

	test("counts only the titles won while he was there", () => {
		const facts = getRetirementStory({
			player: player(),
			club: club({ titleSeasons: [2020, 2030, 2035, 2040] }),
		});

		expect(facts?.titles).toBe(2);
	});

	test("makes a decorated legend a bigger story", () => {
		const withTitles = getRetirementStory({
			player: player(),
			club: club({ titleSeasons: [2030, 2035] }),
		})!;
		const without = getRetirementStory({ player: player(), club: club() })!;

		expect(withTitles.significance).toBeGreaterThan(without.significance);
		expect(withTitles.significance).toBeLessThanOrEqual(
			RETIREMENT_STORY_SETTINGS.maxSignificance,
		);
	});
});

describe("couldBeALegend", () => {
	test("skips the players no club will remember", () => {
		expect(
			couldBeALegend(
				player({
					byTid: [
						{ tid: 4, gp: 8, value: 20, firstSeason: 2038, lastSeason: 2038 },
					],
				}),
			),
		).toBe(false);
		expect(couldBeALegend(player())).toBe(true);
	});
});

describe("describeRetirement", () => {
	const write = (overrides = {}) =>
		describeRetirement({
			facts: getRetirementStory({
				player: player(),
				club: club({ titleSeasons: [2030] }),
				...overrides,
			})!,
			club: "the Foo Bars",
			scoring: "points",
		});

	test("says how long he stayed, what he won, and what he scored", () => {
		const text = write();
		expect(text).toContain("Sam Smith");
		expect(text).toContain("300 appearances");
		expect(text).toContain("2000 points");
		expect(text).toContain("1 title");
	});

	test("says a one-club player played for nobody else", () => {
		expect(write()).toContain("played for nobody but the Foo Bars");
	});

	test("says when nobody has played more for the club", () => {
		const text = describeRetirement({
			facts: getRetirementStory({
				player: player({ statsTids: [4, 9] }),
				club: club({ mostAppearances: 300, mostScoring: 9999 }),
			})!,
			club: "the Foo Bars",
			scoring: "points",
		});
		expect(text).toContain("Nobody has played more games for the club");
	});
});
