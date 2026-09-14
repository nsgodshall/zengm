import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import {
	canAffordFee,
	canAiAffordFee,
	getAiOfferFee,
	getAskingPrice,
	getContractSeasonsLeft,
	getTransferFunds,
	MAX_ASKING_PRICE_MULTIPLE,
	respondToTransferOffer,
	tickTransferOffers,
} from "./transferMarket.ts";

describe("getAiOfferFee", () => {
	test("offers below the fee for a listed player, and above it for one who isn't", () => {
		const low = () => 0;
		const high = () => 0.999_999;

		expect(getAiOfferFee({ fee: 10000, listed: true, random: low })).toBe(7500);
		expect(getAiOfferFee({ fee: 10000, listed: true, random: high })).toBe(
			10000,
		);
		expect(getAiOfferFee({ fee: 10000, listed: false, random: low })).toBe(
			9000,
		);
		expect(getAiOfferFee({ fee: 10000, listed: false, random: high })).toBe(
			12000,
		);
	});
});

describe("tickTransferOffers", () => {
	test("each offer has a day less to run, and offers that run out are gone", () => {
		expect(
			tickTransferOffers([
				{ tid: 1, fee: 100, daysLeft: 3 },
				{ tid: 2, fee: 200, daysLeft: 1 },
			]),
		).toEqual([{ tid: 1, fee: 100, daysLeft: 2 }]);
	});
});

describe("getAskingPrice", () => {
	test("a club sells a player it can do without at his fee", () => {
		expect(getAskingPrice({ fee: 10000, sellerValueChange: 0 })).toBe(10000);
		expect(getAskingPrice({ fee: 10000, sellerValueChange: -5 })).toBe(10000);
	});

	test("the more a club would miss a player, the more it asks", () => {
		expect(getAskingPrice({ fee: 10000, sellerValueChange: -10 })).toBe(15000);
		expect(getAskingPrice({ fee: 10000, sellerValueChange: -15 })).toBe(20000);
	});

	test("up to a limit", () => {
		expect(getAskingPrice({ fee: 10000, sellerValueChange: -100 })).toBe(
			10000 * MAX_ASKING_PRICE_MULTIPLE,
		);
	});

	test("rounds to the nearest $50k", () => {
		expect(getAskingPrice({ fee: 1234, sellerValueChange: -6 })).toBe(1350);
	});
});

describe("respondToTransferOffer", () => {
	test("accepts the asking price or more", () => {
		expect(respondToTransferOffer({ offer: 10000, askingPrice: 10000 })).toBe(
			"accept",
		);
		expect(respondToTransferOffer({ offer: 12000, askingPrice: 10000 })).toBe(
			"accept",
		);
	});

	test("counters a close offer, and rejects a lowball one", () => {
		expect(respondToTransferOffer({ offer: 7000, askingPrice: 10000 })).toBe(
			"counter",
		);
		expect(respondToTransferOffer({ offer: 9999, askingPrice: 10000 })).toBe(
			"counter",
		);
		expect(respondToTransferOffer({ offer: 6999, askingPrice: 10000 })).toBe(
			"reject",
		);
	});
});

describe("canAffordFee", () => {
	test("a club can go into debt down to half its wage budget", () => {
		expect(canAffordFee({ cash: 10000, fee: 60000, wageBudget: 100000 })).toBe(
			true,
		);
		expect(canAffordFee({ cash: 10000, fee: 60001, wageBudget: 100000 })).toBe(
			false,
		);
	});
});

describe("canAiAffordFee", () => {
	test("an AI club only spends cash it has", () => {
		expect(canAiAffordFee({ cash: 50000, fee: 50000 })).toBe(true);
		expect(canAiAffordFee({ cash: 50000, fee: 50001 })).toBe(false);
		expect(canAiAffordFee({ cash: -10000, fee: 1000 })).toBe(false);
	});
});

describe("getTransferFunds", () => {
	test("is cash plus half the wage budget, and never below 0", () => {
		expect(getTransferFunds({ cash: 10000, wageBudget: 100000 })).toBe(60000);
		expect(getTransferFunds({ cash: -80000, wageBudget: 100000 })).toBe(0);
	});
});

describe("getContractSeasonsLeft", () => {
	test("counts this season while it's still being played", () => {
		expect(
			getContractSeasonsLeft({
				exp: 2021,
				season: 2020,
				phase: PHASE.REGULAR_SEASON,
			}),
		).toBe(2);
		expect(
			getContractSeasonsLeft({ exp: 2021, season: 2020, phase: PHASE.DRAFT }),
		).toBe(1);
		expect(
			getContractSeasonsLeft({ exp: 2020, season: 2020, phase: PHASE.DRAFT }),
		).toBe(0);
	});
});
