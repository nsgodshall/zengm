import { describe, expect, test } from "vitest";
import {
	getBoardObjective,
	getBoardObjectiveMoodDeltas,
} from "./boardObjectives.ts";

// 16 clubs, like a generated World's Divisions: 2 up automatically, a playoff
// for the next 4, and 3 down
const topTier = {
	numClubs: 16,
	topTier: true,
	numAutoPromoted: 0,
	numPromotionPlayoffTeams: 0,
	numRelegated: 3,
};
const secondTier = {
	numClubs: 16,
	topTier: false,
	numAutoPromoted: 2,
	numPromotionPlayoffTeams: 4,
	numRelegated: 0,
};

describe("getBoardObjective", () => {
	test("expects a finish 2 places below the squad's strength rank in a Division of 16, named by its part of the table", () => {
		expect(getBoardObjective({ ...topTier, strengthRank: 1 })).toEqual({
			kind: "title",
			targetPosition: 3,
		});
		expect(getBoardObjective({ ...topTier, strengthRank: 5 })).toEqual({
			kind: "topHalf",
			targetPosition: 7,
		});
		expect(getBoardObjective({ ...topTier, strengthRank: 9 })).toEqual({
			kind: "midTable",
			targetPosition: 11,
		});
		expect(getBoardObjective({ ...secondTier, strengthRank: 1 })).toEqual({
			kind: "promotionPlayoff",
			targetPosition: 3,
		});
		expect(getBoardObjective({ ...secondTier, strengthRank: 5 })).toEqual({
			kind: "topHalf",
			targetPosition: 7,
		});
	});

	test("weak clubs are asked to avoid relegation, except in a bottom tier", () => {
		for (const strengthRank of [12, 16]) {
			expect(getBoardObjective({ ...topTier, strengthRank })).toEqual({
				kind: "avoidRelegation",
				targetPosition: 13,
			});
		}
		expect(getBoardObjective({ ...secondTier, strengthRank: 16 })).toEqual({
			kind: "midTable",
			targetPosition: 16,
		});
	});

	test("the strongest club in a small Division is asked to win promotion", () => {
		expect(
			getBoardObjective({ ...secondTier, numClubs: 10, strengthRank: 1 }),
		).toEqual({ kind: "promotion", targetPosition: 2 });
	});
});

describe("getBoardObjectiveMoodDeltas", () => {
	const deltas = (position: number, outcome?: "promoted" | "relegated") =>
		getBoardObjectiveMoodDeltas({
			targetPosition: 8,
			position,
			numClubs: 16,
			outcome,
		});

	test("meeting the objective is a little good, and beating or missing it by more counts more, within limits", () => {
		expect(deltas(8).wins).toBeCloseTo(0.05);
		expect(deltas(4).wins).toBeCloseTo(0.25);
		expect(deltas(1).wins).toBeCloseTo(0.25);
		expect(deltas(9).wins).toBeCloseTo(-0.1);
		expect(deltas(12).wins).toBeCloseTo(-0.25);
		expect(deltas(16).wins).toBeCloseTo(-0.3);
	});

	test("promotion and titles are good, and relegation is bad", () => {
		expect(deltas(8).playoffs).toBe(0);
		expect(deltas(1, "promoted").playoffs).toBe(0.2);
		expect(
			getBoardObjectiveMoodDeltas({
				targetPosition: 3,
				position: 1,
				numClubs: 16,
				outcome: "champion",
			}).playoffs,
		).toBe(0.2);
		expect(deltas(16, "relegated").playoffs).toBe(-0.2);
	});
});
