import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import {
	describePromotion,
	describeRelegation,
	describeTitle,
	getLongestTitleRun,
} from "./storyContext.ts";

// A club's history from 2020, one entry per season: its tier, and C for
// champion, U for promoted, D for relegated
const makeHistory = (seasons: string[]): WorldHistoryEntry[] =>
	seasons.map((code, i) => {
		const tier = Number(code[0]);
		const entry: WorldHistoryEntry = {
			season: 2020 + i,
			divisionId: tier,
			tier,
			position: code.includes("C") ? 1 : 8,
			numClubs: 16,
			pyramidPosition: (tier - 1) * 16 + (code.includes("C") ? 1 : 8),
			points: 50,
		};
		if (code.includes("C")) {
			entry.champion = true;
		}
		if (code.includes("U")) {
			entry.moved = "promoted";
		}
		if (code.includes("D")) {
			entry.moved = "relegated";
		}
		return entry;
	});

describe("describeTitle", () => {
	const title = (seasons: string[], countryRecordRun = 99) =>
		describeTitle({
			history: makeHistory(seasons),
			season: 2020 + seasons.length,
			tier: 1,
			countryRecordRun,
		});

	test("counts titles in a row, and knows a record run", () => {
		expect(title(["1", "1C"]).sentences).toEqual([
			"They're champions for the second season in a row.",
		]);
		expect(title(["1C", "1C", "1C"])).toEqual({
			sentences: ["It's their fourth title in a row."],
			scoreBonus: 5,
		});
		expect(title(["1C", "1C", "1C", "1C"], 4)).toEqual({
			sentences: ["It's a record fifth title in a row."],
			scoreBonus: 10,
		});
		expect(title(["1C", "1C"], 3).sentences).toEqual([
			"It's their third title in a row, equalling the record.",
		]);
	});

	test("notices promoted champions, titles close together, and long waits", () => {
		expect(title(["2", "2CU"]).sentences).toEqual([
			"They were only promoted last season.",
		]);
		expect(title(["1", "1C", "1", "1C", "1"]).sentences).toEqual([
			"It's their third title in 5 seasons.",
		]);
		expect(title(["1C", ...Array(10).fill("1")]).sentences).toEqual([
			"It's their first title since 2020.",
		]);
		expect(title(Array(10).fill("1"))).toEqual({
			sentences: ["It's their first title in 11 seasons."],
			scoreBonus: 10,
		});
		expect(title(Array(9).fill("1"))).toEqual({ sentences: [], scoreBonus: 0 });
	});

	test("finds the longest title run in a Country", () => {
		expect(
			getLongestTitleRun(
				[
					makeHistory(["1C", "1C", "1", "1C"]),
					makeHistory(["1", "1", "1C", "1", "1C", "1C", "1C"]),
					makeHistory(["2C", "2C", "2C", "2C"]),
				],
				1,
			),
		).toBe(3);
	});
});

describe("describePromotion", () => {
	const promotion = (seasons: string[]) =>
		describePromotion({
			history: makeHistory(seasons),
			season: 2020 + seasons.length,
			toTier: 1,
			toName: "First Division",
		});

	test("knows a club bouncing straight back, returning after years away, or arriving for the first time", () => {
		expect(promotion(["1", "1D"]).sentences).toEqual([
			"They bounce straight back after one season down.",
		]);
		expect(
			promotion(["1D", "2", "2", "2", "2", "2", "2", "2", "2", "2"]),
		).toEqual({
			sentences: ["They're back in the First Division after 10 seasons away."],
			scoreBonus: 10,
		});
		expect(promotion(["1D", "2"]).sentences).toEqual([
			"They're back in the First Division after 2 seasons away.",
		]);
		expect(promotion(Array(10).fill("2")).sentences).toEqual([
			"They reach the First Division for the first time in 11 seasons.",
		]);
		expect(promotion(["2"]).sentences).toEqual([]);
	});

	test("counts promotions in a row", () => {
		expect(
			describePromotion({
				history: makeHistory(["3U", "2U"]),
				season: 2022,
				toTier: 1,
				toName: "First Division",
			}),
		).toEqual({
			sentences: ["It's their third promotion in a row."],
			scoreBonus: 10,
		});
	});
});

describe("describeRelegation", () => {
	const relegation = (seasons: string[]) =>
		describeRelegation({
			history: makeHistory(seasons),
			season: 2020 + seasons.length,
			fromTier: 1,
			fromName: "First Division",
		});

	test("knows fallen champions, clubs going straight back down, and relegations in a row", () => {
		expect(relegation(["1", "1C", "1"])).toEqual({
			sentences: ["They were champions just 2 seasons ago."],
			scoreBonus: 10,
		});
		expect(relegation(["2U"]).sentences).toEqual([
			"They go straight back down after one season.",
		]);
		expect(
			describeRelegation({
				history: makeHistory(["1D"]),
				season: 2021,
				fromTier: 2,
				fromName: "Second Division",
			}).sentences,
		).toEqual(["It's their second relegation in a row."]);
	});

	test("knows a long stay coming to an end, or a first relegation", () => {
		expect(relegation(Array(12).fill("1"))).toEqual({
			sentences: ["It ends 13 seasons in the First Division."],
			scoreBonus: 10,
		});
		// 9 seasons back up isn't long enough, and it has been relegated before
		expect(
			relegation(["1", "1D", "2U", "1", "1", "1", "1", "1", "1", "1", "1"])
				.sentences,
		).toEqual([]);
		expect(
			relegation([...Array(5).fill("2"), "2U", ...Array(5).fill("1")])
				.sentences,
		).toEqual(["It's their first relegation in 12 seasons."]);
	});
});
