import type { TeamSeason } from "../../../common/types.ts";

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
