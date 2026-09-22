import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import { buildClubSquadPlan } from "./clubSquadPlan.ts";
import {
	ACADEMY_LOAN_MIN_AGE,
	aiWouldBorrow,
	aiWouldLend,
	aiWouldLendAcademyPlayer,
	canLoanAcademyPlayer,
	getLoanEndSeason,
	getLoanPlayingTimeModifier,
	LOAN_MAX_AGE,
} from "./loans.ts";

describe("getLoanPlayingTimeModifier", () => {
	test("honors the borrower's rotation plan only while the loan is active", () => {
		expect(getLoanPlayingTimeModifier({ season: 2027 }, 2027)).toBe(1.05);
		expect(getLoanPlayingTimeModifier({ season: 2027 }, 2028)).toBe(1);
		expect(getLoanPlayingTimeModifier(undefined, 2027)).toBe(1);
	});
});

describe("getLoanEndSeason", () => {
	test("a loan made before the playoffs are over ends this summer", () => {
		for (const phase of [
			PHASE.PRESEASON,
			PHASE.REGULAR_SEASON,
			PHASE.AFTER_TRADE_DEADLINE,
			PHASE.PLAYOFFS,
		]) {
			expect(getLoanEndSeason({ season: 2026, phase })).toBe(2026);
		}
	});

	test("a loan made in the summer lasts through next season", () => {
		for (const phase of [
			PHASE.DRAFT_LOTTERY,
			PHASE.DRAFT,
			PHASE.AFTER_DRAFT,
			PHASE.RESIGN_PLAYERS,
			PHASE.FREE_AGENCY,
		]) {
			expect(getLoanEndSeason({ season: 2026, phase })).toBe(2027);
		}
	});
});

// A roster of 12, whose 10-man rotation is everyone worth 45 or more
const roster = [70, 65, 60, 58, 55, 52, 50, 48, 46, 45, 40, 35];
const squadPlan = (rosterValues = roster, rotationSize = 10) =>
	buildClubSquadPlan({
		rosterValues,
		wageBudget: 100_000,
		minContract: 1_000,
		minimumRosterSize: 5,
		maxRosterSize: 15,
		rotationSize,
	});

describe("aiWouldLend", () => {
	const lend = (options: Partial<Parameters<typeof aiWouldLend>[0]>) =>
		aiWouldLend({
			age: 20,
			plannedAction: "loan",
			...options,
		});

	test("lends out a young player outside the rotation", () => {
		expect(lend({})).toBe(true);
		expect(lend({ plannedAction: "loan" })).toBe(true);
	});

	test("keeps every player the squad plan did not mark for a loan", () => {
		expect(lend({ plannedAction: "retain" })).toBe(false);
		expect(lend({ plannedAction: "core" })).toBe(false);
	});

	test("keeps older players", () => {
		expect(LOAN_MAX_AGE).toBe(23);
		expect(lend({ age: 23 })).toBe(true);
		expect(lend({ age: 24 })).toBe(false);
	});

	test("requires a concrete action from the current plan", () => {
		expect(lend({ plannedAction: undefined })).toBe(false);
	});
});

describe("aiWouldBorrow", () => {
	test("borrows a player who'd be in its rotation", () => {
		expect(
			aiWouldBorrow({
				valueNoPot: 46,
				squadPlan: squadPlan(),
			}),
		).toBe(true);
		expect(
			aiWouldBorrow({
				valueNoPot: 45,
				squadPlan: squadPlan(),
			}),
		).toBe(false);
	});

	test("borrows anyone when its roster is smaller than a rotation", () => {
		expect(
			aiWouldBorrow({
				valueNoPot: 10,
				squadPlan: squadPlan([60, 50]),
			}),
		).toBe(true);
	});
});

describe("canLoanAcademyPlayer", () => {
	test("an academy player can go on loan once he's old enough", () => {
		expect(ACADEMY_LOAN_MIN_AGE).toBe(18);
		expect(
			canLoanAcademyPlayer({
				age: 17,
				graduationSeason: 2030,
				loanEndSeason: 2026,
			}),
		).toBe(false);
		expect(
			canLoanAcademyPlayer({
				age: 18,
				graduationSeason: 2030,
				loanEndSeason: 2026,
			}),
		).toBe(true);
	});

	test("a loan can end the summer he leaves the academy, but not after", () => {
		expect(
			canLoanAcademyPlayer({
				age: 21,
				graduationSeason: 2026,
				loanEndSeason: 2026,
			}),
		).toBe(true);
		expect(
			canLoanAcademyPlayer({
				age: 21,
				graduationSeason: 2026,
				loanEndSeason: 2027,
			}),
		).toBe(false);
	});
});

describe("aiWouldLendAcademyPlayer", () => {
	test("lends out a prospect who isn't ready for its first team's rotation", () => {
		expect(
			aiWouldLendAcademyPlayer({
				valueNoPot: 44,
				squadPlan: squadPlan(),
			}),
		).toBe(true);
	});

	test("keeps a prospect who'd already be in its rotation, since it would promote him", () => {
		expect(
			aiWouldLendAcademyPlayer({
				valueNoPot: 45,
				squadPlan: squadPlan(),
			}),
		).toBe(false);
	});

	test("keeps everyone when its first team is smaller than a rotation", () => {
		expect(
			aiWouldLendAcademyPlayer({
				valueNoPot: 10,
				squadPlan: squadPlan([60, 50]),
			}),
		).toBe(false);
	});
});
