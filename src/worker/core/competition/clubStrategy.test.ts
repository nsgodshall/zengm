import { describe, expect, test } from "vitest";
import {
	buildWorldClubStrategy,
	canAddContractToWorldClubStrategy,
	getWorldPlayingTimePromise,
	getWorldPlayingTimePromiseModifier,
} from "./clubStrategy.ts";
import { PHASE } from "../../../common/constants.ts";

const player = (age: number, amount: number, exp: number) => ({
	age,
	contract: { amount, exp },
});

const build = (
	overrides: Partial<Parameters<typeof buildWorldClubStrategy>[0]> = {},
) =>
	buildWorldClubStrategy({
		tier: 2,
		previousTier: 2,
		teamStrategy: "contending",
		players: [player(25, 20_000, 2031), player(29, 10_000, 2032)],
		season: 2030,
		cash: 50_000,
		wageBudget: 100_000,
		...overrides,
	});

describe("buildWorldClubStrategy", () => {
	test("promoted clubs plan for survival and relegated clubs push to return", () => {
		expect(build({ tier: 1, previousTier: 2 })).toMatchObject({
			strategy: "survival",
			recentMovement: "promoted",
		});
		expect(build({ tier: 2, previousTier: 1 })).toMatchObject({
			strategy: "promotionPush",
			recentMovement: "relegated",
		});
	});

	test("a relegated club under financial pressure rebuilds", () => {
		expect(build({ tier: 2, previousTier: 1, cash: -150_000 })).toMatchObject({
			strategy: "rebuild",
			financialPressure: true,
		});
	});

	test("board objectives distinguish title, promotion, and survival plans", () => {
		expect(
			build({ tier: 1, previousTier: 1, boardObjectiveKind: "title" }).strategy,
		).toBe("titleChallenge");
		expect(build({ boardObjectiveKind: "promotion" }).strategy).toBe(
			"promotionPush",
		);
		expect(
			build({
				tier: 1,
				previousTier: 1,
				boardObjectiveKind: "avoidRelegation",
			}).strategy,
		).toBe("survival");
	});

	test("an older rebuilding squad or a financially stressed club rebuilds", () => {
		expect(
			build({
				teamStrategy: "rebuilding",
				players: [player(28, 10_000, 2031), player(30, 10_000, 2031)],
			}).strategy,
		).toBe("rebuild");
		expect(build({ cash: -150_000 }).strategy).toBe("rebuild");
	});

	test("projects committed roster and payroll through two summers", () => {
		const plan = build({
			players: [
				player(24, 20_000, 2030),
				player(25, 30_000, 2031),
				player(26, 40_000, 2032),
			],
		});
		expect(plan.contractOutlook).toEqual([
			{ season: 2031, rosterSize: 2, payroll: 70_000, payrollRoom: 30_000 },
			{ season: 2032, rosterSize: 1, payroll: 40_000, payrollRoom: 60_000 },
		]);
	});

	test("future deals reserve a complete squad and bound competitive overage", () => {
		const promotionPush = build({ boardObjectiveKind: "promotion" });
		expect(
			canAddContractToWorldClubStrategy({
				plan: promotionPush,
				amount: 60_000,
				exp: 2032,
				wageBudget: 100_000,
				minContract: 1_000,
				minimumRosterSize: 14,
			}),
		).toBe(true);
		expect(
			canAddContractToWorldClubStrategy({
				plan: promotionPush,
				amount: 65_000,
				exp: 2032,
				wageBudget: 100_000,
				minContract: 1_000,
				minimumRosterSize: 14,
			}),
		).toBe(false);

		const pressured = build({
			boardObjectiveKind: "promotion",
			cash: -150_000,
		});
		expect(
			canAddContractToWorldClubStrategy({
				plan: pressured,
				amount: 60_000,
				exp: 2032,
				wageBudget: 100_000,
				minContract: 1_000,
				minimumRosterSize: 14,
			}),
		).toBe(false);
		expect(
			canAddContractToWorldClubStrategy({
				plan: pressured,
				amount: 2_000,
				exp: 2032,
				wageBudget: 10_000,
				minContract: 1_000,
				minimumRosterSize: 14,
			}),
		).toBe(true);
	});

	test("competitive signings receive a one-season role promise", () => {
		const promise = getWorldPlayingTimePromise({
			strategy: "survival",
			role: "starter",
			age: 28,
			season: 2030,
			phase: PHASE.FREE_AGENCY,
		});
		expect(promise).toEqual({ role: "starter", season: 2031 });
		expect(getWorldPlayingTimePromiseModifier(promise, 2031)).toBe(1.05);
		expect(getWorldPlayingTimePromiseModifier(promise, 2032)).toBe(1);
		expect(
			getWorldPlayingTimePromise({
				strategy: "balanced",
				role: "starter",
				age: 25,
				season: 2030,
				phase: PHASE.REGULAR_SEASON,
			}),
		).toBeUndefined();
	});
});
