import {
	DEFAULT_LEVEL,
	MAX_LEVEL,
	levelToEffect,
} from "../../../common/budgetLevels.ts";
import type {
	Team,
	WorldFinanceLedger,
	WorldInfrastructure,
	WorldInfrastructureKey,
} from "../../../common/types.ts";
import { getCapitalInvestment } from "./worldRevenue.ts";

export const WORLD_INFRASTRUCTURE_KEYS: WorldInfrastructureKey[] = [
	"academy",
	"training",
	"medical",
	"scouting",
	"stadium",
	"commercial",
];

export const WORLD_DEBT_INTEREST_RATE = 0.05;
export const WORLD_OWNER_SUPPORT_DEBT_LIMIT = 2;
export const WORLD_PROMOTION_SPENDING_SHARE = 0.2;

export const getInitialWorldInfrastructure = (
	budget: Team["budget"],
): WorldInfrastructure => ({
	academy: { level: budget.scouting, invested: 0 },
	training: { level: budget.coaching, invested: 0 },
	medical: { level: budget.health, invested: 0 },
	scouting: { level: budget.scouting, invested: 0 },
	stadium: { level: budget.facilities, invested: 0 },
	commercial: { level: budget.facilities, invested: 0 },
});

export const getEmptyWorldFinanceLedger = (): WorldFinanceLedger => ({
	transferFeesPaid: 0,
	transferFeesReceived: 0,
	capitalProjects: 0,
	debtInterest: 0,
	ownerFunding: 0,
	prizeMoney: 0,
	openingDebt: 0,
	promotionSpendingLimit: 0,
});

export const ensureWorldFinanceLedger = (
	ledger: WorldFinanceLedger | undefined,
) => ledger ?? getEmptyWorldFinanceLedger();

export const getWorldInfrastructureOperatingLevel = ({
	assetLevel,
	marketLevel,
}: {
	assetLevel: number;
	marketLevel: number;
}) => Math.max(marketLevel, assetLevel);

export const getWorldAcademyInfrastructureBonus = (level: number) =>
	0.25 * Math.max(0, levelToEffect(level));

export const getWorldCommercialRevenueMultiplier = (level: number) =>
	1 + 0.08 * Math.max(0, levelToEffect(level));

export type WorldInfrastructureInvestment = {
	infrastructure: WorldInfrastructure;
	allocations: Record<WorldInfrastructureKey, number>;
	investmentSpent: number;
	stadiumSeatsAdded: number;
};

/**
 * Turns a capital budget into durable asset levels. One season's revenue buys
 * 100 total level points, always assigned to the weakest asset first. This
 * makes each dollar observable and prevents a club from maximizing one asset
 * while the rest of its operation remains neglected.
 */
export const investInWorldInfrastructure = ({
	infrastructure,
	investment,
	revenue,
}: {
	infrastructure: WorldInfrastructure;
	investment: number;
	revenue: number;
}): WorldInfrastructureInvestment => {
	const next = Object.fromEntries(
		WORLD_INFRASTRUCTURE_KEYS.map((key) => [key, { ...infrastructure[key] }]),
	) as WorldInfrastructure;
	const pointsWanted =
		investment > 0 && revenue > 0
			? Math.max(1, Math.round((100 * investment) / revenue))
			: 0;
	const pointsByAsset = Object.fromEntries(
		WORLD_INFRASTRUCTURE_KEYS.map((key) => [key, 0]),
	) as Record<WorldInfrastructureKey, number>;

	for (let i = 0; i < pointsWanted; i++) {
		const key = [...WORLD_INFRASTRUCTURE_KEYS]
			.filter((candidate) => next[candidate].level < MAX_LEVEL)
			.sort((a, b) => next[a].level - next[b].level)[0];
		if (key === undefined) {
			break;
		}
		next[key].level += 1;
		pointsByAsset[key] += 1;
	}

	const pointsBought = Object.values(pointsByAsset).reduce(
		(total, points) => total + points,
		0,
	);
	const investmentSpent =
		pointsBought === 0
			? 0
			: Math.round(investment * (pointsBought / pointsWanted));
	const allocations = Object.fromEntries(
		WORLD_INFRASTRUCTURE_KEYS.map((key) => [
			key,
			pointsBought === 0
				? 0
				: Math.round(investmentSpent * (pointsByAsset[key] / pointsBought)),
		]),
	) as Record<WorldInfrastructureKey, number>;
	const allocationTotal = Object.values(allocations).reduce(
		(total, amount) => total + amount,
		0,
	);
	if (pointsBought > 0) {
		const lastFunded = [...WORLD_INFRASTRUCTURE_KEYS]
			.reverse()
			.find((key) => pointsByAsset[key] > 0)!;
		allocations[lastFunded] += investmentSpent - allocationTotal;
	}
	for (const key of WORLD_INFRASTRUCTURE_KEYS) {
		next[key].invested += allocations[key];
	}

	return {
		infrastructure: next,
		allocations,
		investmentSpent,
		stadiumSeatsAdded: Math.round(allocations.stadium / 10),
	};
};

export type WorldPreseasonFinance = {
	capitalBudget: number;
	debtInterest: number;
	ownerFunding: number;
	promotionSpendingLimit: number;
	cashBeforeCapital: number;
};

/** Applies interest and exceptional owner support before capital is chosen. */
export const buildWorldPreseasonFinance = ({
	cash,
	revenue,
	promotionRevenueGain = 0,
}: {
	cash: number;
	revenue: number;
	promotionRevenueGain?: number;
}): WorldPreseasonFinance => {
	const debtInterest = Math.round(
		Math.max(0, -cash) * WORLD_DEBT_INTEREST_RATE,
	);
	let cashBeforeCapital = cash - debtInterest;
	const debtLimit = WORLD_OWNER_SUPPORT_DEBT_LIMIT * Math.max(0, revenue);
	const ownerFunding = Math.max(0, Math.round(-debtLimit - cashBeforeCapital));
	cashBeforeCapital += ownerFunding;
	return {
		capitalBudget: getCapitalInvestment({ cash: cashBeforeCapital, revenue }),
		debtInterest,
		ownerFunding,
		promotionSpendingLimit: Math.round(
			WORLD_PROMOTION_SPENDING_SHARE * Math.max(0, promotionRevenueGain),
		),
		cashBeforeCapital,
	};
};

export type WorldFinanceProjection = {
	season: number;
	cash: number;
	debt: number;
	interest: number;
	operatingResult: number;
};

export const projectWorldClubFinances = ({
	season,
	cash,
	revenue,
	runningCosts,
	payroll,
	years = 3,
}: {
	season: number;
	cash: number;
	revenue: number;
	runningCosts: number;
	payroll: number;
	years?: number;
}): WorldFinanceProjection[] => {
	const output: WorldFinanceProjection[] = [];
	let projectedCash = cash;
	for (let i = 1; i <= years; i++) {
		const interest = Math.round(
			Math.max(0, -projectedCash) * WORLD_DEBT_INTEREST_RATE,
		);
		const operatingResult = revenue - runningCosts - payroll;
		projectedCash += operatingResult - interest;
		output.push({
			season: season + i,
			cash: projectedCash,
			debt: Math.max(0, -projectedCash),
			interest,
			operatingResult,
		});
	}
	return output;
};

export const getWorldInfrastructureSummary = (
	infrastructure: WorldInfrastructure | undefined,
) =>
	WORLD_INFRASTRUCTURE_KEYS.map((key) => ({
		key,
		level: infrastructure?.[key].level ?? DEFAULT_LEVEL,
		invested: infrastructure?.[key].invested ?? 0,
	}));
