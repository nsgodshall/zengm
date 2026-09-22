import { describe, expect, test } from "vitest";
import {
	getWorldDevelopmentArchetype,
	getWorldDevelopmentPlan,
} from "./worldPlayerDevelopment.ts";

const findPid = (
	archetype: ReturnType<typeof getWorldDevelopmentArchetype>,
) => {
	for (let pid = 0; pid < 1000; pid++) {
		if (getWorldDevelopmentArchetype(pid) === archetype) {
			return pid;
		}
	}
	throw new Error(`No pid for ${archetype}`);
};

const plan = (
	overrides: Partial<Parameters<typeof getWorldDevelopmentPlan>[0]> = {},
) =>
	getWorldDevelopmentPlan({
		pid: findPid("standard"),
		age: 21,
		gamesPlayed: 20,
		teamGames: 30,
		tier: 2,
		numTiers: 3,
		...overrides,
	});

describe("getWorldDevelopmentPlan", () => {
	test("rewards actual playing time and a productive loan", () => {
		const idle = plan({ gamesPlayed: 0 });
		const regular = plan({ gamesPlayed: 22 });
		const loanRegular = plan({ gamesPlayed: 22, onLoan: true });

		expect(regular.positiveFactor).toBeGreaterThan(idle.positiveFactor);
		expect(loanRegular.positiveFactor).toBeGreaterThan(regular.positiveFactor);
	});

	test("makes late bloomers slower early and faster in their mid twenties", () => {
		const standardPid = findPid("standard");
		const latePid = findPid("late");
		const youngStandard = plan({ pid: standardPid, age: 20 });
		const youngLate = plan({ pid: latePid, age: 20 });
		const olderStandard = plan({ pid: standardPid, age: 24 });
		const olderLate = plan({ pid: latePid, age: 24 });

		expect(youngLate.positiveFactor).toBeLessThan(youngStandard.positiveFactor);
		expect(olderLate.positiveFactor).toBeGreaterThan(
			olderStandard.positiveFactor,
		);
	});

	test("keeps stalled prospects distinct and stable for a player", () => {
		const pid = findPid("stalled");
		expect(getWorldDevelopmentArchetype(pid)).toBe("stalled");
		expect(plan({ pid }).positiveFactor).toBeLessThan(plan().positiveFactor);
	});

	test("uses role fulfillment as morale and medical quality to limit injury decline", () => {
		const fulfilled = plan({ gamesPlayed: 25, promisedRole: "starter" });
		const missed = plan({ gamesPlayed: 4, promisedRole: "starter" });
		const basicMedical = plan({ injuryGamesRemaining: 20, medicalLevel: 34 });
		const eliteMedical = plan({ injuryGamesRemaining: 20, medicalLevel: 100 });

		expect(fulfilled.promiseFulfilled).toBe(true);
		expect(missed.promiseFulfilled).toBe(false);
		expect(eliteMedical.negativeFactor).toBeLessThan(
			basicMedical.negativeFactor,
		);
	});

	test("lets academy development remain neutral when no playing-time data exists", () => {
		expect(
			plan({
				gamesPlayed: 0,
				teamGames: 30,
				hasPlayingTimeData: false,
			}).positiveFactor,
		).toBeGreaterThan(plan({ gamesPlayed: 0 }).positiveFactor);
	});
});
