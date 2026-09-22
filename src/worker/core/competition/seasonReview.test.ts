import { describe, expect, test } from "vitest";
import {
	buildSeasonReviewPrompt,
	checkSeasonReview,
	getReviewClubs,
	SEASON_REVIEW_SETTINGS,
	type SeasonReviewFacts,
} from "./seasonReview.ts";

const facts = (
	overrides: Partial<SeasonReviewFacts> = {},
): SeasonReviewFacts => ({
	season: 2031,
	country: "Spain",
	divisions: [
		{
			name: "Spanish First Division",
			tier: 1,
			champion: { name: "Real Madrid CF", points: 45 },
			promoted: [],
			relegated: ["Celta de Vigo", "Las Palmas UD"],
		},
		{
			name: "Spanish Second Division",
			tier: 2,
			champion: { name: "Almería UD", points: 39 },
			promoted: ["Almería UD", "Cádiz CF"],
			relegated: [],
		},
	],
	stories: [
		{ kind: "titleDefended", text: "The Real Madrid CF kept their title." },
		{ kind: "relegationConfirmed", text: "The Celta de Vigo went down." },
	],
	...overrides,
});

describe("buildSeasonReviewPrompt", () => {
	test("hands over the season's facts and nothing else", () => {
		const { system, user } = buildSeasonReviewPrompt(facts());

		expect(user).toContain("Spain");
		expect(user).toContain("2031");
		expect(user).toContain("Real Madrid CF on 45 points");
		expect(user).toContain("relegated Celta de Vigo, Las Palmas UD");
		expect(user).toContain("The Real Madrid CF kept their title.");
		expect(system).toContain("only use the facts given to you");
	});

	test("says who was promoted and relegated, or nobody", () => {
		const { user } = buildSeasonReviewPrompt(facts());

		expect(user).toContain("promoted nobody");
		expect(user).toContain("relegated nobody");
	});

	test("keeps a busy season's biggest stories only", () => {
		const many = Array.from({ length: 40 }, (_, i) => ({
			kind: "titleRace",
			text: `Story ${i}`,
		}));
		const { user } = buildSeasonReviewPrompt(facts({ stories: many }));

		expect(user).toContain("Story 0");
		expect(user).toContain(`Story ${SEASON_REVIEW_SETTINGS.maxStories - 1}`);
		expect(user).not.toContain(`Story ${SEASON_REVIEW_SETTINGS.maxStories}`);
	});

	test("names every club the review may use", () => {
		expect([...getReviewClubs(facts())].sort()).toEqual([
			"Almería UD",
			"Celta de Vigo",
			"Cádiz CF",
			"Las Palmas UD",
			"Real Madrid CF",
		]);
	});
});

describe("checkSeasonReview", () => {
	const check = (text: string, overrides = {}) =>
		checkSeasonReview({
			text,
			facts: facts(),
			earliestSeason: 2026,
			...overrides,
		});

	const good =
		"Real Madrid CF took the Spanish First Division again, finishing on 45 points. Celta de Vigo and Las Palmas UD went down, while Almería UD came up as champions of the Spanish Second Division.";

	test("passes a review built from the facts", () => {
		expect(check(good)).toEqual([]);
	});

	test("catches an empty one", () => {
		expect(check("   ")).toEqual([{ kind: "empty" }]);
	});

	test("catches one that never names the champions", () => {
		const problems = check(
			"It was a season of surprises across Spain, with the title decided late and two clubs going down. Almería UD came up.",
		);

		expect(problems).toContainEqual({
			kind: "missingChampion",
			club: "Real Madrid CF",
		});
	});

	test("catches a year the World has never played", () => {
		expect(check(`${good} Their first title since 1998.`)).toContainEqual({
			kind: "unknownYear",
			year: 1998,
		});
	});

	test("allows a year the World has played", () => {
		expect(check(`${good} Their first title since 2028.`)).toEqual([]);
	});

	test("catches one that ignores the length brief", () => {
		const problems = check(
			`${good} ${"word ".repeat(SEASON_REVIEW_SETTINGS.maxWords)}`,
		);

		expect(problems.some((problem) => problem.kind === "tooLong")).toBe(true);
	});
});
