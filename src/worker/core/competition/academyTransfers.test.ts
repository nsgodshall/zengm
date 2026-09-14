import { describe, expect, test } from "vitest";
import {
	ACADEMY_FEE_SEASONS,
	AI_ACADEMY_BUY_RANK,
	BEST_ACADEMY_PLAYER_ASKING_PRICE_MULTIPLE,
	aiWantsAcademyPlayer,
	getAcademyAskingPrice,
	getAcademyTransferFee,
} from "./transferMarket.ts";

describe("getAcademyTransferFee", () => {
	test("is a season of his market wage above the minimum", () => {
		expect(ACADEMY_FEE_SEASONS).toBe(1);
		expect(
			getAcademyTransferFee({ marketWage: 21_250, minContract: 1250 }),
		).toBe(20_000);

		// Rounded to the nearest $50k
		expect(
			getAcademyTransferFee({ marketWage: 11_280, minContract: 1250 }),
		).toBe(10_050);
	});

	test("a prospect worth about the minimum wage still costs a minimum contract", () => {
		expect(getAcademyTransferFee({ marketWage: 1250, minContract: 1250 })).toBe(
			1250,
		);
		expect(getAcademyTransferFee({ marketWage: 1300, minContract: 1250 })).toBe(
			1250,
		);
	});
});

describe("getAcademyAskingPrice", () => {
	test("a club asks double for its most valuable academy player", () => {
		expect(BEST_ACADEMY_PLAYER_ASKING_PRICE_MULTIPLE).toBe(2);
		expect(getAcademyAskingPrice({ fee: 10_000, isBestInAcademy: true })).toBe(
			20_000,
		);
		expect(getAcademyAskingPrice({ fee: 10_000, isBestInAcademy: false })).toBe(
			10_000,
		);
	});
});

describe("aiWantsAcademyPlayer", () => {
	test("an AI club only buys a player who'd be one of the 3 best in its academy", () => {
		expect(AI_ACADEMY_BUY_RANK).toBe(3);
		expect(aiWantsAcademyPlayer({ value: 60, academyValues: [] })).toBe(true);
		expect(
			aiWantsAcademyPlayer({ value: 60, academyValues: [70, 65, 50, 40] }),
		).toBe(true);
		expect(
			aiWantsAcademyPlayer({ value: 60, academyValues: [70, 65, 62, 50] }),
		).toBe(false);
	});

	test("a player only as good as 3 already there isn't wanted", () => {
		expect(
			aiWantsAcademyPlayer({ value: 60, academyValues: [60, 60, 60] }),
		).toBe(false);
	});
});
