import { describe, expect, test } from "vitest";
import {
	CLUB_OWNER_SETTINGS,
	getAdministrationDeduction,
	isInAdministration,
	getNextOwner,
	getOwnerDebtLimit,
	getOwnerFunding,
	getTakeoverChance,
} from "./clubOwners.ts";

// A random sequence that repeats, for picking owners without surprises
const sequence = (values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length]!;
};

describe("getTakeoverChance", () => {
	const base = {
		stature: 40,
		tier: 1,
		cash: 100000,
		revenue: 500000,
		champion: false,
	};

	test("sleeping giants and clubs deep in debt attract buyers, champions don't", () => {
		const settings = CLUB_OWNER_SETTINGS;
		expect(getTakeoverChance(base)).toBeCloseTo(settings.takeoverChance);
		expect(getTakeoverChance({ ...base, stature: 70, tier: 2 })).toBeCloseTo(
			settings.takeoverChance * settings.sleepingGiantFactor,
		);
		// A big club in the top tier isn't sleeping
		expect(getTakeoverChance({ ...base, stature: 70 })).toBeCloseTo(
			settings.takeoverChance,
		);
		expect(getTakeoverChance({ ...base, cash: -600000 })).toBeCloseTo(
			settings.takeoverChance * settings.distressFactor,
		);
		expect(getTakeoverChance({ ...base, champion: true })).toBeCloseTo(
			settings.takeoverChance * settings.championFactor,
		);
	});
});

describe("getNextOwner", () => {
	test("a takeover by a benefactor brings money for several seasons", () => {
		// The first number picks the kind (benefactor is the second weight), the
		// next two the money and the seasons
		const { owner, change } = getNextOwner({
			owner: undefined,
			season: 2030,
			revenue: 500000,
			takeover: true,
			random: sequence([0.45, 0.5, 0.5]),
		});
		expect(change).toBe("takeover");
		expect(owner.kind).toBe("benefactor");
		expect(owner.since).toBe(2030);
		expect(owner.fundingPerSeason).toBe(275000);
		expect(owner.seasonsLeft).toBe(6);
		expect(getOwnerFunding(owner)).toBe(275000);
	});

	test("a benefactor's money runs out, and then the club lives on its own", () => {
		let owner = {
			kind: "benefactor" as const,
			since: 2030,
			fundingPerSeason: 100000,
			seasonsLeft: 2,
		};
		const first = getNextOwner({
			owner,
			season: 2031,
			revenue: 500000,
			takeover: false,
			random: sequence([0.5]),
		});
		expect(first.change).toBe(undefined);
		expect(first.owner.seasonsLeft).toBe(1);

		owner = first.owner as typeof owner;
		const second = getNextOwner({
			owner,
			season: 2032,
			revenue: 500000,
			takeover: false,
			random: sequence([0.5]),
		});
		expect(second.change).toBe("fundingOver");
		expect(getOwnerFunding(second.owner)).toBe(0);

		const third = getNextOwner({
			owner: second.owner,
			season: 2033,
			revenue: 500000,
			takeover: false,
			random: sequence([0.5]),
		});
		expect(third.change).toBe(undefined);
		expect(third.owner).toEqual(second.owner);
	});

	test("how much debt an owner covers depends on the kind", () => {
		const revenue = 400000;
		expect(getOwnerDebtLimit({ owner: undefined, revenue })).toBe(400000);
		expect(
			getOwnerDebtLimit({
				owner: {
					kind: "benefactor",
					since: 2030,
					fundingPerSeason: 0,
					seasonsLeft: 0,
				},
				revenue,
			}),
		).toBe(1200000);
		expect(
			getOwnerDebtLimit({
				owner: {
					kind: "fanOwned",
					since: 2030,
					fundingPerSeason: 0,
					seasonsLeft: 0,
				},
				revenue,
			}),
		).toBe(300000);
	});
});

describe("administration", () => {
	const revenue = 400000;

	test("a club goes into administration when its debt passes what its owner covers", () => {
		const local = {
			kind: "local" as const,
			since: 2030,
			fundingPerSeason: 0,
			seasonsLeft: 0,
		};
		expect(isInAdministration({ cash: -399000, revenue, owner: local })).toBe(
			false,
		);
		expect(isInAdministration({ cash: -401000, revenue, owner: local })).toBe(
			true,
		);
		// A benefactor covers three times as much
		expect(
			isInAdministration({
				cash: -401000,
				revenue,
				owner: { ...local, kind: "benefactor" },
			}),
		).toBe(false);
	});

	test("the points deducted are about a tenth of a season", () => {
		expect(getAdministrationDeduction({ numGames: 38, winPoints: 3 })).toBe(11);
		expect(getAdministrationDeduction({ numGames: 10, winPoints: 3 })).toBe(3);
		expect(getAdministrationDeduction({ numGames: 2, winPoints: 1 })).toBe(1);
	});
});
