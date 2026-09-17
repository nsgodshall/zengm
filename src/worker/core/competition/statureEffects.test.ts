import { describe, expect, test } from "vitest";
import {
	getRestingHype,
	getStatureCommercialMultiplier,
	getStatureMoodComponent,
	getStatureWageFactor,
	orderByStatureWeightedRandom,
	STATURE_EFFECT_SETTINGS,
} from "./statureEffects.ts";

describe("stature effects", () => {
	test("every effect is neutral at the neutral stature", () => {
		const neutral = STATURE_EFFECT_SETTINGS.neutralStature;
		expect(getStatureCommercialMultiplier(neutral)).toBe(1);
		expect(getStatureWageFactor(neutral)).toBe(1);
		expect(getStatureMoodComponent(neutral)).toBe(0);
		expect(getRestingHype(neutral)).toBeCloseTo(0.5025);
	});

	test("bigger clubs keep more hype, earn more, pay less, and please players more, within bounds", () => {
		expect(getRestingHype(0)).toBeCloseTo(0.3);
		expect(getRestingHype(100)).toBeCloseTo(0.75);
		expect(getStatureCommercialMultiplier(95)).toBeCloseTo(1.75);
		expect(getStatureCommercialMultiplier(100)).toBe(1.8);
		expect(getStatureCommercialMultiplier(5)).toBe(0.6);
		expect(getStatureWageFactor(95)).toBeCloseTo(0.8);
		expect(getStatureWageFactor(100)).toBe(0.8);
		expect(getStatureWageFactor(10)).toBeCloseTo(1.14);
		expect(getStatureWageFactor(0)).toBe(1.15);
		expect(getStatureMoodComponent(95)).toBe(2);
		expect(getStatureMoodComponent(20)).toBe(-1);
	});

	test("bigger clubs tend to act first", () => {
		let seed = 1;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		let bigFirst = 0;
		for (let i = 0; i < 2000; i++) {
			const [first] = orderByStatureWeightedRandom(
				[
					{ name: "small", stature: 0 },
					{ name: "big", stature: 100 },
				],
				(club) => club.stature,
				random,
			);
			if (first!.name === "big") {
				bigFirst += 1;
			}
		}
		// With weights 1 and 3, the big club comes first 3 times in 4
		expect(bigFirst / 2000).toBeGreaterThan(0.7);
		expect(bigFirst / 2000).toBeLessThan(0.8);
	});
});
