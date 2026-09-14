import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import {
	aiWouldBorrow,
	aiWouldLend,
	getLoanEndSeason,
	LOAN_MAX_AGE,
} from "./loans.ts";

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

describe("aiWouldLend", () => {
	const lend = (options: Partial<Parameters<typeof aiWouldLend>[0]>) =>
		aiWouldLend({
			age: 20,
			valueNoPot: 40,
			rosterValuesNoPot: roster,
			rotationSize: 10,
			minRosterSize: 5,
			...options,
		});

	test("lends out a young player outside the rotation", () => {
		expect(lend({})).toBe(true);
		expect(lend({ valueNoPot: 35 })).toBe(true);
	});

	test("keeps players in the rotation", () => {
		expect(lend({ valueNoPot: 45 })).toBe(false);
		expect(lend({ valueNoPot: 70 })).toBe(false);
	});

	test("keeps older players", () => {
		expect(LOAN_MAX_AGE).toBe(23);
		expect(lend({ age: 23 })).toBe(true);
		expect(lend({ age: 24 })).toBe(false);
	});

	test("keeps everyone when its roster is too small", () => {
		expect(lend({ minRosterSize: 12 })).toBe(false);
		expect(
			lend({
				rosterValuesNoPot: [60, 50, 40],
				valueNoPot: 40,
				minRosterSize: 2,
			}),
		).toBe(false);
	});
});

describe("aiWouldBorrow", () => {
	test("borrows a player who'd be in its rotation", () => {
		expect(
			aiWouldBorrow({
				valueNoPot: 46,
				rosterValuesNoPot: roster,
				rotationSize: 10,
			}),
		).toBe(true);
		expect(
			aiWouldBorrow({
				valueNoPot: 45,
				rosterValuesNoPot: roster,
				rotationSize: 10,
			}),
		).toBe(false);
	});

	test("borrows anyone when its roster is smaller than a rotation", () => {
		expect(
			aiWouldBorrow({
				valueNoPot: 10,
				rosterValuesNoPot: [60, 50],
				rotationSize: 10,
			}),
		).toBe(true);
	});
});
