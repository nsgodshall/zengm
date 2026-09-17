import { describe, expect, test } from "vitest";
import {
	buildClubSquadPlan,
	buildClubSummerPlan,
	canAddContractAfterMinimumRosterReserve,
	evaluatePlayerForClubSquadPlan,
	fillsClubRotationNeed,
	getClubRecruitmentFocus,
	getClubSquadRecruitmentNeed,
	getPlannedPlayerAction,
	getRecruitmentCandidateScore,
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

describe("buildClubSummerPlan", () => {
	const player = (
		pid: number,
		valueNoPot: number,
		options: {
			value?: number;
			age?: number;
			amount?: number;
			exp?: number;
		} = {},
	) => ({
		pid,
		valueNoPot,
		value: options.value ?? valueNoPot,
		age: options.age ?? 28,
		contract: {
			amount: options.amount ?? 1_000,
			exp: options.exp ?? 2031,
		},
	});
	const summerPlan = (players: ReturnType<typeof player>[], season = 2030) =>
		buildClubSummerPlan({
			players,
			season,
			wageBudget: 100_000,
			minContract: 1_000,
			minimumRosterSize: 14,
			maxRosterSize: 18,
			rotationSize: 10,
		});

	test("orders roster construction before upgrades and depth", () => {
		const short = summerPlan(
			Array.from({ length: 8 }, (_, i) => player(i, 80 - i)),
		);
		expect(short.needs).toEqual([
			{ kind: "fillMinimumRoster", priority: 1, players: 6 },
			{ kind: "repairRotation", priority: 2, players: 2 },
			{ kind: "addDepth", priority: 3, players: 2 },
		]);

		const complete = summerPlan(
			Array.from({ length: 14 }, (_, i) => player(i, 80 - i)),
		);
		expect(complete.needs).toEqual([
			{
				kind: "upgradeStarter",
				priority: 2,
				players: 1,
				cutoffValue: 70,
			},
			{ kind: "addDepth", priority: 3, players: 2 },
		]);
	});

	test("marks core players, useful depth, prospects, and surplus contracts", () => {
		const players = Array.from({ length: 18 }, (_, i) =>
			player(i + 1, 100 - i),
		);
		players[14] = player(15, 86, { amount: 5_000, exp: 2030 });
		players[15] = player(16, 85, { value: 100, age: 21 });
		players[16] = player(17, 84, { value: 100, age: 21 });
		players[17] = player(18, 83, { exp: 2032 });

		const actions = new Map(
			summerPlan(players).playerActions.map((row) => [row.pid, row.action]),
		);
		expect(actions.get(1)).toBe("core");
		expect(actions.get(14)).toBe("retain");
		expect(actions.get(15)).toBe("release");
		expect(actions.get(16)).toBe("loan");
		expect(actions.get(17)).toBe("loan");
		expect(actions.get(18)).toBe("transfer");
	});

	test("reserves minimum wages for every place not already under contract", () => {
		const plan = summerPlan([
			player(1, 60, { amount: 10_000, exp: 2031 }),
			player(2, 50, { amount: 8_000, exp: 2031 }),
			player(3, 40, { amount: 5_000, exp: 2030 }),
		]);
		expect(plan.committedRosterSize).toBe(2);
		expect(plan.committedPayroll).toBe(18_000);
		expect(plan.minimumContractReserve).toBe(12_000);
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

describe("shared player-movement decisions", () => {
	test("matches candidates to the first squad need they can fill", () => {
		const shortPlan = buildPlan([70, 60, 50, 40, 30]);
		expect(
			getClubSquadRecruitmentNeed({ plan: shortPlan, playerValue: 10 }),
		).toBe("fillMinimumRoster");

		const completePlan = buildPlan();
		expect(
			getClubSquadRecruitmentNeed({ plan: completePlan, playerValue: 62 }),
		).toBe("upgradeStarter");
		expect(
			getClubSquadRecruitmentNeed({ plan: completePlan, playerValue: 10 }),
		).toBe("addDepth");

		const targetPlan = buildPlan([
			80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 14, 13,
		]);
		expect(
			getClubSquadRecruitmentNeed({ plan: targetPlan, playerValue: 10 }),
		).toBeUndefined();
	});

	test("a borrower takes only a player who clears its rotation cutoff", () => {
		const plan = buildPlan();
		expect(fillsClubRotationNeed({ plan, playerValue: 36 })).toBe(true);
		expect(fillsClubRotationNeed({ plan, playerValue: 35 })).toBe(false);
	});

	test("looks up the action assigned to a player", () => {
		const players = Array.from({ length: 18 }, (_, i) => ({
			pid: i + 1,
			value: 100 - i,
			valueNoPot: 100 - i,
			age: 28,
			contract: { amount: 1_000, exp: 2031 },
		}));
		const plan = buildClubSummerPlan({
			players,
			season: 2030,
			wageBudget: 100_000,
			minContract: 1_000,
			minimumRosterSize: 14,
			maxRosterSize: 18,
			rotationSize: 10,
		});
		expect(getPlannedPlayerAction(plan, 1)).toBe("core");
		expect(getPlannedPlayerAction(plan, 18)).toBe("transfer");
		expect(getPlannedPlayerAction(plan, 999)).toBeUndefined();
	});

	test("rebuilds value potential while competitive pushes value current ability", () => {
		expect(getClubRecruitmentFocus({ teamStrategy: "rebuilding" })).toBe(
			"potential",
		);
		expect(
			getClubRecruitmentFocus({
				teamStrategy: "rebuilding",
				boardObjectiveKind: "promotion",
			}),
		).toBe("current");
		expect(
			getClubRecruitmentFocus({
				teamStrategy: "contending",
				clubStrategy: "balanced",
			}),
		).toBe("balanced");
		expect(
			getClubRecruitmentFocus({
				teamStrategy: "contending",
				clubStrategy: "rebuild",
			}),
		).toBe("potential");
		expect(
			getRecruitmentCandidateScore({
				focus: "potential",
				value: 70,
				valueNoPot: 50,
			}),
		).toBe(70);
		expect(
			getRecruitmentCandidateScore({
				focus: "current",
				value: 70,
				valueNoPot: 50,
			}),
		).toBe(50);
		expect(
			getRecruitmentCandidateScore({
				focus: "balanced",
				value: 70,
				valueNoPot: 50,
			}),
		).toBe(60);
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

	test("reserves minimum wages for still-empty roster places", () => {
		const signing = {
			payroll: 80_000,
			wageBudget: 100_000,
			minContract: 1_000,
			minimumRosterSize: 14,
			rosterSize: 8,
		};
		expect(
			canAddContractAfterMinimumRosterReserve({
				...signing,
				amount: 15_000,
			}),
		).toBe(true);
		expect(
			canAddContractAfterMinimumRosterReserve({
				...signing,
				amount: 16_000,
			}),
		).toBe(false);
		expect(
			canAddContractAfterMinimumRosterReserve({
				...signing,
				payroll: 110_000,
				amount: 1_000,
			}),
		).toBe(true);
	});
});
