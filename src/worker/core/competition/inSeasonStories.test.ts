import { describe, expect, test } from "vitest";
import {
	detectInSeasonStories,
	getClinchedTopPlaces,
	getConfirmedBottomPlaces,
	getEmptyInSeasonStoryState,
	type InSeasonTableRow,
	writeInSeasonStory,
} from "./inSeasonStories.ts";

const row = (
	tid: number,
	points: number,
	played: number,
	runs: Partial<Pick<InSeasonTableRow, "winning" | "losing">> = {},
): InSeasonTableRow => ({
	tid,
	points,
	played,
	winning: 0,
	losing: 0,
	...runs,
});

describe("clinching", () => {
	// 10-game seasons, 3 points a win
	const options = { numGames: 10, winPoints: 3 };

	test("a club clinches a place once too few others can reach its points", () => {
		const rows = [row(0, 24, 8), row(1, 17, 8), row(2, 12, 8), row(3, 3, 8)];
		expect(
			getClinchedTopPlaces({ rows, places: 1, ...options }).map((r) => r.tid),
		).toEqual([0]);
		// Club 1 could still be caught by club 2 (12 + 6 = 18)
		expect(
			getClinchedTopPlaces({ rows, places: 2, ...options }).map((r) => r.tid),
		).toEqual([0]);

		// Level points aren't enough, since tiebreakers could go either way
		const level = [row(0, 24, 8), row(1, 18, 8)];
		expect(
			getClinchedTopPlaces({ rows: level, places: 1, ...options }),
		).toEqual([]);
	});

	test("a club is relegated once enough clubs are out of its reach", () => {
		const rows = [row(0, 24, 8), row(1, 17, 8), row(2, 12, 8), row(3, 3, 8)];
		expect(
			getConfirmedBottomPlaces({ rows, places: 1, ...options }).map(
				(r) => r.tid,
			),
		).toEqual([3]);
		expect(
			getConfirmedBottomPlaces({ rows, places: 1, numGames: 12, winPoints: 3 }),
		).toEqual([]);
	});
});

describe("detectInSeasonStories", () => {
	const divisions = (
		rowsTop: InSeasonTableRow[],
		rowsBottom: InSeasonTableRow[],
	) => [
		{ divisionId: 1, tier: 1, numGames: 10, winPoints: 3, rows: rowsTop },
		{ divisionId: 2, tier: 2, numGames: 10, winPoints: 3, rows: rowsBottom },
	];
	const links = [
		{
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 1,
			numAutoRelegated: 1,
		},
	];

	test("titles, promotion, and relegation settled early are each told once", () => {
		const first = detectInSeasonStories({
			state: getEmptyInSeasonStoryState(2030),
			divisions: divisions(
				[row(0, 24, 8), row(1, 17, 8), row(2, 12, 8), row(3, 3, 8)],
				[row(4, 21, 8), row(5, 12, 8)],
			),
			links,
		});
		expect(first.stories.map((story) => [story.kind, story.tid])).toEqual([
			["titleClinched", 0],
			["relegationConfirmed", 3],
			["titleClinched", 4],
			["promotionClinched", 4],
		]);
		expect(
			writeInSeasonStory(first.stories[0]!, "Club 0", "First Division"),
		).toBe("Club 0 have won the First Division with 2 games to spare.");

		const second = detectInSeasonStories({
			state: first.state,
			divisions: divisions(
				[row(0, 27, 9), row(1, 17, 9), row(2, 15, 9), row(3, 3, 9)],
				[row(4, 24, 9), row(5, 12, 9)],
			),
			links,
		});
		expect(second.stories).toEqual([]);
	});

	test("nothing is settled early once every game is played", () => {
		const { stories } = detectInSeasonStories({
			state: getEmptyInSeasonStoryState(2030),
			divisions: divisions([row(0, 30, 10), row(1, 3, 10)], []),
			links,
		});
		expect(stories).toEqual([]);
	});

	test("runs are told at 10 games and every 5 after, and again once a new run starts", () => {
		let state = getEmptyInSeasonStoryState(2030);
		const told: string[] = [];
		for (const [winning, losing] of [
			[9, 0],
			[10, 0],
			[11, 0],
			[15, 0],
			[0, 1],
			[10, 0],
		]) {
			const result = detectInSeasonStories({
				state,
				divisions: [
					{
						divisionId: 1,
						tier: 1,
						numGames: 38,
						winPoints: 3,
						rows: [row(0, 0, 20, { winning, losing })],
					},
				],
				links: [],
			});
			state = result.state;
			told.push(
				...result.stories
					.filter((story) => story.kind === "winningRun")
					.map((story) =>
						writeInSeasonStory(story, "Club 0", "First Division"),
					),
			);
		}
		expect(told).toEqual([
			"Club 0 have won 10 games in a row.",
			"Club 0 have won 15 games in a row.",
			"Club 0 have won 10 games in a row.",
		]);
	});
});
