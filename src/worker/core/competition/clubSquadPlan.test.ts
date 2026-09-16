import { describe, expect, test } from "vitest";
import {
	buildClubSquadPlan,
	evaluatePlayerForClubSquadPlan,
	getWorldNewContractLimit,
	WORLD_MINIMUM_TEAMMATES_RESERVED,
} from "./clubSquadPlan.ts";

const buildPlan = (
	rosterValues = [80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15],
) =>
	buildClubSquadPlan({
		rosterValues,
		wageBudget: 100_000,
		minContract: 1_000,
		minimumRosterSize: 14,
		maxRosterSize: 18,
		rotationSize: 10,
	});

describe("buildClubSquadPlan", () => {
	test("records a complete squad's targets, wage reserve, and role cutoffs", () => {
		const plan = buildPlan();

		expect(plan.rosterSize).toBe(14);
		expect(plan.targetRosterSize).toBe(16);
		expect(plan.openRosterSlots).toBe(2);
		expect(plan.minimumSquadReserve).toBe(13_000);
		expect(plan.discretionaryWageBudget).toBe(87_000);
		expect(plan.roles).toMatchObject({
			key: {
				firstRank: 1,
				lastRank: 3,
				currentPlayers: 3,
				openSlots: 0,
				cutoffValue: 70,
			},
			starter: {
				firstRank: 4,
				lastRank: 11,
				currentPlayers: 8,
				openSlots: 0,
				cutoffValue: 30,
			},
			rotation: {
				firstRank: 12,
				lastRank: 14,
				currentPlayers: 3,
				openSlots: 0,
				cutoffValue: 15,
			},
			depth: {
				firstRank: 15,
				lastRank: 16,
				currentPlayers: 0,
				openSlots: 2,
			},
		});
	});

	test("shows which role slots are open on a short roster", () => {
		const plan = buildPlan([70, 60, 50, 40, 30]);

		expect(plan.openRosterSlots).toBe(11);
		expect(plan.roles.key.openSlots).toBe(0);
		expect(plan.roles.starter.openSlots).toBe(6);
		expect(plan.roles.rotation.openSlots).toBe(3);
		expect(plan.roles.depth.openSlots).toBe(2);
	});
});

describe("evaluatePlayerForClubSquadPlan", () => {
	test("classifies a player and reports whether he improves the role cutoff", () => {
		const plan = buildPlan();
		expect(
			evaluatePlayerForClubSquadPlan({ plan, playerValue: 90 }),
		).toMatchObject({ role: "key", rank: 1, improvesRole: true });
		expect(
			evaluatePlayerForClubSquadPlan({ plan, playerValue: 62 }),
		).toMatchObject({ role: "starter", rank: 5, improvesRole: true });
		expect(
			evaluatePlayerForClubSquadPlan({ plan, playerValue: 27 }),
		).toMatchObject({ role: "rotation", rank: 12, improvesRole: true });
		expect(
			evaluatePlayerForClubSquadPlan({ plan, playerValue: 10 }),
		).toMatchObject({ role: "depth", rank: 15, improvesRole: true });
	});
});

describe("World lower-tier contract limits", () => {
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
