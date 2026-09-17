import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import { buildWorldRollOfHonour } from "./worldLeagueHistory.ts";

const structure: CompetitionStructure = {
	countries: [
		{ countryId: 0, name: "Northland" },
		{ countryId: 1, name: "Southland" },
	],
	competitionDivisions: [
		{ divisionId: 2, countryId: 0, tier: 2, name: "North 2" },
		{ divisionId: 1, countryId: 0, tier: 1, name: "North 1" },
		{ divisionId: 3, countryId: 1, tier: 1, name: "South 1" },
	],
	promotionRelegationLinks: [],
};

const entry = (
	season: number,
	divisionId: number,
	position: number,
	extra: Partial<WorldHistoryEntry> = {},
): WorldHistoryEntry => ({
	season,
	divisionId,
	tier: divisionId === 2 ? 2 : 1,
	position,
	numClubs: 4,
	pyramidPosition: position,
	points: 10,
	...(position === 1 ? { champion: true } : {}),
	...extra,
});

describe("buildWorldRollOfHonour", () => {
	test("lists each Country's champions by tier, runners-up, and moves to and from its top tier, newest first", () => {
		const [north, south] = buildWorldRollOfHonour({
			structure,
			clubs: [
				{ tid: 0, history: [entry(2030, 1, 1), entry(2031, 1, 1)] },
				{
					tid: 1,
					history: [
						entry(2030, 1, 2),
						entry(2031, 1, 4, { moved: "relegated" }),
					],
				},
				{
					tid: 2,
					history: [
						entry(2030, 2, 1, { moved: "promoted" }),
						entry(2031, 1, 2),
					],
				},
				{
					tid: 3,
					history: [
						entry(2030, 1, 4, { moved: "relegated" }),
						entry(2031, 2, 2, { moved: "promoted", promotionPlayoff: "won" }),
					],
				},
				{ tid: 4, history: [entry(2031, 2, 1)] },
				{ tid: 5, history: [entry(2031, 3, 1)] },
			],
		});

		expect(north!.divisions.map((division) => division.name)).toEqual([
			"North 1",
			"North 2",
		]);
		expect(north!.seasons).toEqual([
			{
				season: 2031,
				champions: [
					{ tid: 0, count: 2 },
					{ tid: 4, count: 1 },
				],
				runnerUp: { tid: 2, count: 1 },
				promotedToTop: [{ tid: 3, viaPlayoff: true }],
				relegatedFromTop: [1],
			},
			{
				season: 2030,
				champions: [
					{ tid: 0, count: 1 },
					{ tid: 2, count: 1 },
				],
				runnerUp: { tid: 1, count: 1 },
				promotedToTop: [{ tid: 2, viaPlayoff: false }],
				relegatedFromTop: [3],
			},
		]);

		expect(south!.seasons).toEqual([
			{
				season: 2031,
				champions: [{ tid: 5, count: 1 }],
				runnerUp: undefined,
				promotedToTop: [],
				relegatedFromTop: [],
			},
		]);
	});
});
