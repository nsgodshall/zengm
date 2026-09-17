import { PHASE } from "../../../common/constants.ts";
import type { Phase, TeamSeason } from "../../../common/types.ts";
import type { WorldSquadRole } from "./clubSquadPlan.ts";

export type WorldClubStrategy =
	| "titleChallenge"
	| "promotionPush"
	| "survival"
	| "balanced"
	| "rebuild";

export type WorldClubMovement = "promoted" | "relegated" | undefined;

export type ClubContractOutlook = {
	season: number;
	rosterSize: number;
	payroll: number;
	payrollRoom: number;
};

export type WorldClubStrategyPlan = {
	strategy: WorldClubStrategy;
	recentMovement: WorldClubMovement;
	averageAge: number;
	financialPressure: boolean;
	contractOutlook: [ClubContractOutlook, ClubContractOutlook];
};

export const WORLD_STRATEGY_FUTURE_BUDGET_MULTIPLIERS: Record<
	WorldClubStrategy,
	number
> = {
	titleChallenge: 1.02,
	promotionPush: 1.05,
	survival: 1.03,
	balanced: 1,
	rebuild: 0.95,
};

export type ClubStrategyPlayer = {
	age: number;
	contract: {
		amount: number;
		exp: number;
	};
};

/**
 * A compact multi-season direction rebuilt from current club state. It stores
 * no detailed plan and projects only contracts that already exist.
 */
export const buildWorldClubStrategy = ({
	tier,
	previousTier,
	boardObjectiveKind,
	teamStrategy,
	players,
	season,
	cash,
	wageBudget,
}: {
	tier: number;
	previousTier?: number;
	boardObjectiveKind?: NonNullable<TeamSeason["boardObjective"]>["kind"];
	teamStrategy: "contending" | "rebuilding";
	players: ClubStrategyPlayer[];
	season: number;
	cash: number;
	wageBudget: number;
}): WorldClubStrategyPlan => {
	const recentMovement =
		previousTier === undefined || previousTier === tier
			? undefined
			: tier < previousTier
				? "promoted"
				: "relegated";
	const averageAge =
		players.length > 0
			? players.reduce((total, p) => total + p.age, 0) / players.length
			: 0;
	const contractOutlook = [season + 1, season + 2].map((futureSeason) => {
		const committed = players.filter((p) => p.contract.exp >= futureSeason);
		const payroll = committed.reduce(
			(total, p) => total + p.contract.amount,
			0,
		);
		return {
			season: futureSeason,
			rosterSize: committed.length,
			payroll,
			payrollRoom: wageBudget - payroll,
		};
	}) as [ClubContractOutlook, ClubContractOutlook];
	const financialPressure =
		cash < -wageBudget || contractOutlook[0].payroll > 1.1 * wageBudget;

	let strategy: WorldClubStrategy;
	if (recentMovement === "promoted") {
		strategy = "survival";
	} else if (recentMovement === "relegated") {
		strategy = financialPressure ? "rebuild" : "promotionPush";
	} else if (boardObjectiveKind === "title") {
		strategy = "titleChallenge";
	} else if (
		boardObjectiveKind === "promotion" ||
		boardObjectiveKind === "promotionPlayoff"
	) {
		strategy = "promotionPush";
	} else if (boardObjectiveKind === "avoidRelegation") {
		strategy = "survival";
	} else if (
		financialPressure ||
		(teamStrategy === "rebuilding" && averageAge >= 27)
	) {
		strategy = "rebuild";
	} else {
		strategy = "balanced";
	}

	return {
		strategy,
		recentMovement,
		averageAge,
		financialPressure,
		contractOutlook,
	};
};

/**
 * An expensive new deal must leave a minimum wage for unresolved future roster
 * places. Modest deals up to two minimum salaries remain available to lower
 * divisions. Competitive plans may borrow a small, bounded share of next
 * year's budget; a rebuild keeps a buffer instead. Financial pressure removes
 * all overage.
 */
export const canAddContractToWorldClubStrategy = ({
	plan,
	amount,
	exp,
	wageBudget,
	minContract,
	minimumRosterSize,
}: {
	plan: WorldClubStrategyPlan;
	amount: number;
	exp: number;
	wageBudget: number;
	minContract: number;
	minimumRosterSize: number;
}) => {
	if (amount <= 2 * minContract) {
		return true;
	}
	const multiplier = plan.financialPressure
		? 1
		: WORLD_STRATEGY_FUTURE_BUDGET_MULTIPLIERS[plan.strategy];
	return plan.contractOutlook.every((outlook) => {
		if (exp < outlook.season) {
			return true;
		}
		const rosterSize = outlook.rosterSize + 1;
		const minimumReserve =
			Math.max(0, minimumRosterSize - rosterSize) * minContract;
		return outlook.payroll + amount + minimumReserve <= wageBudget * multiplier;
	});
};

export const getWorldPlayingTimePromise = ({
	strategy,
	role,
	age,
	season,
	phase,
}: {
	strategy: WorldClubStrategy;
	role: WorldSquadRole;
	age: number;
	season: number;
	phase: Phase;
}) => {
	if (role === "depth" || role === "rotation") {
		return;
	}
	if (strategy === "balanced" && role !== "key") {
		return;
	}
	if (strategy === "rebuild" && role !== "key" && age > 23) {
		return;
	}
	return {
		role,
		season: phase <= PHASE.PLAYOFFS ? season : season + 1,
	} as const;
};

export const getWorldPlayingTimePromiseModifier = (
	promise: { role: "key" | "starter" | "rotation"; season: number } | undefined,
	season: number,
) => {
	if (!promise || promise.season < season) {
		return 1;
	}
	return promise.role === "key"
		? 1.12
		: promise.role === "starter"
			? 1.05
			: 1.02;
};
