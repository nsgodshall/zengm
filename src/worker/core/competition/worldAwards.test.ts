import { describe, expect, test } from "vitest";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import { getWorldAwards } from "./worldAwards.ts";

describe("getWorldAwards", () => {
	const awards = getWorldAwards(defaultGameAttributes.awards);

	test("each Division gets an MVP, a top scorer, and an All-Division team, none acting as the MVP", () => {
		const divisionAwards = awards.filter((award) => award.group === "div");
		expect(divisionAwards.map((award) => award.name)).toEqual([
			"Most Valuable Player",
			"Top Scorer",
			"All-Division",
		]);
		expect(divisionAwards[2]!.numTeams).toBe(1);
		for (const award of divisionAwards) {
			expect("actAs" in award ? award.actAs : undefined).toBeUndefined();
		}
	});

	test("the league MVP, All-League teams, and playoff awards are gone, and the rest stay", () => {
		expect(awards.filter((award) => award.shortName === "MVP")).toHaveLength(1);
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
		expect(new Set(awards.map((award) => award.shortName)).size).toBe(
			awards.length,
		);
	});
});
