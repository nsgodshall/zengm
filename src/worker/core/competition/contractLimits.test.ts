import { describe, expect, test } from "vitest";
import {
	getIntendedSquadRole,
	getWorldNewContractLimit,
	WORLD_MINIMUM_TEAMMATES_RESERVED,
} from "./contractLimits.ts";

describe("World lower-tier contract limits", () => {
	const rosterValues = [80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15];

	test("classifies a player by the squad place his current ability earns", () => {
		expect(getIntendedSquadRole({ playerValue: 90, rosterValues })).toBe("key");
		expect(getIntendedSquadRole({ playerValue: 62, rosterValues })).toBe(
			"starter",
		);
		expect(getIntendedSquadRole({ playerValue: 27, rosterValues })).toBe(
			"rotation",
		);
		expect(getIntendedSquadRole({ playerValue: 10, rosterValues })).toBe(
			"depth",
		);
	});

	test("reserves 13 minimum contracts and pays a key player more than a reserve", () => {
		const wageBudget = 100_000;
		const minContract = 1_000;
		const key = getWorldNewContractLimit({
			wageBudget,
			minContract,
			role: "key",
		});
		const depth = getWorldNewContractLimit({
			wageBudget,
			minContract,
			role: "depth",
		});

		expect(key).toBe(
			minContract +
				0.4 * (wageBudget - WORLD_MINIMUM_TEAMMATES_RESERVED * minContract),
		);
		expect(depth).toBeLessThan(key);
	});

	test("always permits a minimum contract when the budget has no discretionary room", () => {
		expect(
			getWorldNewContractLimit({
				wageBudget: 10_000,
				minContract: 1_000,
				role: "depth",
			}),
		).toBe(1_000);
	});
});
