import { describe, expect, test } from "vitest";
import { defaultAwards } from "../../../common/defaultGameAttributes.ts";
import { FormulaEvaluator } from "../../util/FormulaEvaluator.ts";
import { AWARD_STATS_ALL } from "../awards/getPlayers.ts";
import {
	getWorldAwards,
	getWorldAwardsBeforeSoccerStyle,
	YOUNG_PLAYER_MAX_AGE,
} from "./worldAwards.ts";

const evaluate = (formula: string, age: number) => {
	const evaluator = new FormulaEvaluator(formula, AWARD_STATS_ALL, []);
	const stats: Record<string, number> = {};
	for (const variable of evaluator.usedVariables) {
		stats[variable] = 1;
	}
	stats.age = age;
	return evaluator.evaluate(stats);
};

describe("getWorldAwards", () => {
	const awards = getWorldAwards();

	test("each Division gets an MVP, a top scorer, a young player, and an All-Division team, none acting as the MVP or Rookie of the Year", () => {
		expect(awards.map((award) => award.name)).toEqual([
			"Most Valuable Player",
			"Top Scorer",
			"Young Player of the Season",
			"All-Division",
		]);
		for (const award of awards) {
			expect(award.group).toBe("div");
			expect("actAs" in award ? award.actAs : undefined).toBeUndefined();
		}
		expect(awards[3]!.numTeams).toBe(1);
		expect(new Set(awards.map((award) => award.shortName)).size).toBe(
			awards.length,
		);
	});

	test("the young player is the MVP among players no older than the age limit", () => {
		const mvpFormula = defaultAwards.mvp.formula;
		const youngPlayer = awards.find((award) => award.shortName === "YPS")!;

		expect(evaluate(youngPlayer.formula, YOUNG_PLAYER_MAX_AGE)).toBeCloseTo(
			evaluate(mvpFormula, YOUNG_PLAYER_MAX_AGE),
		);
		expect(evaluate(youngPlayer.formula, 18)).toBeCloseTo(
			evaluate(mvpFormula, 18),
		);
		expect(evaluate(youngPlayer.formula, YOUNG_PLAYER_MAX_AGE + 1)).toBeCloseTo(
			evaluate(mvpFormula, YOUNG_PLAYER_MAX_AGE + 1) - 10000,
		);
		expect(evaluate(youngPlayer.formula, 35)).toBeCloseTo(
			evaluate(mvpFormula, 35) - 10000,
		);
		expect(youngPlayer.maxAge).toBe(YOUNG_PLAYER_MAX_AGE);
	});
});

describe("getWorldAwardsBeforeSoccerStyle", () => {
	test("is the earlier World awards: the Division awards without the young player, plus ZenGM's other regular season awards", () => {
		const awards = getWorldAwardsBeforeSoccerStyle();
		expect(
			awards
				.filter((award) => award.group === "div")
				.map((award) => award.shortName),
		).toEqual(["MVP", "TS", "ALD"]);
		expect(awards.some((award) => award.shortName === "YPS")).toBe(false);
		expect(awards.some((award) => award.shortName === "ALL")).toBe(false);
		expect(
			awards.some(
				(award) =>
					typeof award.statRange === "number" || award.statRange === "playoffs",
			),
		).toBe(false);
		expect(awards.map((award) => award.shortName)).toEqual(
			expect.arrayContaining(["DPOY", "ROY", "SMOY", "MIP", "DEF", "ALR"]),
		);
	});
});
