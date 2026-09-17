import type { TeamSeason } from "../../../common/types.ts";

export type WorldSquadRole = "key" | "starter" | "rotation" | "depth";

export const WORLD_SQUAD_ROLES: WorldSquadRole[] = [
	"key",
	"starter",
	"rotation",
	"depth",
];

// A new signing must leave room for the other 13 players in the World's
// minimum 14-player squad. The fractions divide the money left after that
// reserve according to how much the player is expected to contribute.
export const WORLD_CONTRACT_ROLE_FRACTIONS: Record<WorldSquadRole, number> = {
	key: 0.4,
	starter: 0.18,
	rotation: 0.08,
	depth: 0.03,
};

export const WORLD_MINIMUM_TEAMMATES_RESERVED = 13;

export type ClubSquadRolePlan = {
	role: WorldSquadRole;
	firstRank: number;
	lastRank: number;
	targetPlayers: number;
	currentPlayers: number;
	openSlots: number;
	cutoffValue?: number;
	contractLimit: number;
};

export type ClubSquadPlan = {
	rosterValues: number[];
	rosterSize: number;
	minimumRosterSize: number;
	targetRosterSize: number;
	maxRosterSize: number;
	rotationSize: number;
	openRosterSlots: number;
	wageBudget: number;
	minContract: number;
	minimumSquadReserve: number;
	discretionaryWageBudget: number;
	roles: Record<WorldSquadRole, ClubSquadRolePlan>;
};

export type ClubSquadPlayerEvaluation = {
	role: WorldSquadRole;
	rank: number;
	contractLimit: number;
	improvesRole: boolean;
};

export type ClubSquadPlayerActionType =
	| "core"
	| "retain"
	| "loan"
	| "transfer"
	| "release";

export type ClubSquadPlayerInput = {
	pid: number;
	value: number;
	valueNoPot: number;
	age: number;
	contract: {
		amount: number;
		exp: number;
	};
};

export type ClubSquadPlayerAction = {
	pid: number;
	rank: number;
	role: WorldSquadRole;
	action: ClubSquadPlayerActionType;
};

export type ClubSquadNeed = {
	kind: "fillMinimumRoster" | "repairRotation" | "upgradeStarter" | "addDepth";
	priority: number;
	players: number;
	cutoffValue?: number;
};

export type ClubSquadRecruitmentNeed = ClubSquadNeed["kind"];
export type ClubRecruitmentFocus = "current" | "potential";

export type ClubSummerPlan = {
	squadPlan: ClubSquadPlan;
	needs: ClubSquadNeed[];
	playerActions: ClubSquadPlayerAction[];
	committedRosterSize: number;
	committedPayroll: number;
	minimumContractReserve: number;
};

export const YOUNG_PLAYER_MAX_AGE = 23;
export const YOUNG_PLAYER_POTENTIAL_MARGIN = 8;

export const getWageBudgetAfterMinimumRosterReserve = ({
	wageBudget,
	minContract,
	minimumRosterSize,
	rosterSizeAfterSigning,
}: {
	wageBudget: number;
	minContract: number;
	minimumRosterSize: number;
	rosterSizeAfterSigning: number;
}) =>
	wageBudget -
	Math.max(0, minimumRosterSize - rosterSizeAfterSigning) * minContract;

/** A non-minimum deal cannot spend the wages reserved for a complete squad. */
export const canAddContractAfterMinimumRosterReserve = ({
	payroll,
	amount,
	wageBudget,
	minContract,
	minimumRosterSize,
	rosterSize,
}: {
	payroll: number;
	amount: number;
	wageBudget: number;
	minContract: number;
	minimumRosterSize: number;
	rosterSize: number;
}) =>
	amount - 1 <= minContract ||
	payroll + amount - 1 <=
		getWageBudgetAfterMinimumRosterReserve({
			wageBudget,
			minContract,
			minimumRosterSize,
			rosterSizeAfterSigning: rosterSize + 1,
		});

const getRoleForRank = (
	rank: number,
	lastRankByRole: Record<WorldSquadRole, number>,
): WorldSquadRole => {
	for (const role of WORLD_SQUAD_ROLES) {
		if (rank <= lastRankByRole[role]) {
			return role;
		}
	}
	return "depth";
};

const getRoleForRankInPlan = (plan: ClubSquadPlan, rank: number) =>
	getRoleForRank(
		rank,
		Object.fromEntries(
			WORLD_SQUAD_ROLES.map((role) => [role, plan.roles[role].lastRank]),
		) as Record<WorldSquadRole, number>,
	);

export const getWorldNewContractLimit = ({
	wageBudget,
	minContract,
	role,
}: {
	wageBudget: number;
	minContract: number;
	role: WorldSquadRole;
}) => {
	const reserve = WORLD_MINIMUM_TEAMMATES_RESERVED * minContract;
	const discretionary = Math.max(0, wageBudget - reserve);
	return Math.max(
		minContract,
		Math.round(
			minContract + WORLD_CONTRACT_ROLE_FRACTIONS[role] * discretionary,
		),
	);
};

/** A reusable snapshot that all of a World's club-building systems can share. */
export const buildClubSquadPlan = ({
	rosterValues,
	wageBudget,
	minContract,
	minimumRosterSize,
	maxRosterSize,
	rotationSize,
}: {
	rosterValues: number[];
	wageBudget: number;
	minContract: number;
	minimumRosterSize: number;
	maxRosterSize: number;
	rotationSize: number;
}): ClubSquadPlan => {
	const sortedValues = [...rosterValues].sort((a, b) => b - a);
	const targetRosterSize = Math.max(
		minimumRosterSize,
		Math.min(maxRosterSize, maxRosterSize - 2),
	);
	const keyPlayers = Math.min(
		minimumRosterSize,
		Math.max(1, Math.round(rotationSize * 0.3)),
	);
	const lastRankByRole: Record<WorldSquadRole, number> = {
		key: keyPlayers,
		starter: Math.min(minimumRosterSize, rotationSize + 1),
		rotation: minimumRosterSize,
		depth: targetRosterSize,
	};

	let previousLastRank = 0;
	const roles = {} as Record<WorldSquadRole, ClubSquadRolePlan>;
	for (const role of WORLD_SQUAD_ROLES) {
		const firstRank = previousLastRank + 1;
		const lastRank = lastRankByRole[role];
		const targetPlayers = Math.max(0, lastRank - previousLastRank);
		const currentPlayers = Math.max(
			0,
			Math.min(sortedValues.length, lastRank) - previousLastRank,
		);
		roles[role] = {
			role,
			firstRank,
			lastRank,
			targetPlayers,
			currentPlayers,
			openSlots: targetPlayers - currentPlayers,
			cutoffValue: sortedValues[lastRank - 1],
			contractLimit: getWorldNewContractLimit({
				wageBudget,
				minContract,
				role,
			}),
		};
		previousLastRank = lastRank;
	}

	const minimumSquadReserve = WORLD_MINIMUM_TEAMMATES_RESERVED * minContract;
	return {
		rosterValues: sortedValues,
		rosterSize: sortedValues.length,
		minimumRosterSize,
		targetRosterSize,
		maxRosterSize,
		rotationSize,
		openRosterSlots: Math.max(0, targetRosterSize - sortedValues.length),
		wageBudget,
		minContract,
		minimumSquadReserve,
		discretionaryWageBudget: Math.max(0, wageBudget - minimumSquadReserve),
		roles,
	};
};

export const evaluatePlayerForClubSquadPlan = ({
	plan,
	playerValue,
}: {
	plan: ClubSquadPlan;
	playerValue: number;
}): ClubSquadPlayerEvaluation => {
	const rank =
		1 + plan.rosterValues.filter((value) => value > playerValue).length;
	const role = getRoleForRankInPlan(plan, rank);
	const cutoffValue = plan.roles[role].cutoffValue;
	return {
		role,
		rank,
		contractLimit: plan.roles[role].contractLimit,
		improvesRole: cutoffValue === undefined || playerValue > cutoffValue,
	};
};

/** The first current squad-building job that a candidate would actually do. */
export const getClubSquadRecruitmentNeed = ({
	plan,
	playerValue,
}: {
	plan: ClubSquadPlan;
	playerValue: number;
}): ClubSquadRecruitmentNeed | undefined => {
	if (plan.rosterSize < plan.minimumRosterSize) {
		return "fillMinimumRoster";
	}

	const evaluation = evaluatePlayerForClubSquadPlan({ plan, playerValue });
	if (plan.rosterSize < plan.rotationSize) {
		return "repairRotation";
	}
	if (
		evaluation.rank <= plan.roles.starter.lastRank &&
		evaluation.improvesRole
	) {
		return "upgradeStarter";
	}
	if (plan.rosterSize < plan.targetRosterSize) {
		return "addDepth";
	}
};

/** A loan only helps when the player would enter the borrowing club's rotation. */
export const fillsClubRotationNeed = ({
	plan,
	playerValue,
}: {
	plan: ClubSquadPlan;
	playerValue: number;
}) => {
	if (plan.rosterSize < plan.rotationSize) {
		return true;
	}
	const cutoff = plan.rosterValues[plan.rotationSize - 1];
	return cutoff !== undefined && playerValue > cutoff;
};

export const getPlannedPlayerAction = (plan: ClubSummerPlan, pid: number) =>
	plan.playerActions.find((row) => row.pid === pid)?.action;

/**
 * Existing team strategy supplies the durable signal. A concrete competitive
 * board objective turns this summer into a current-ability push.
 */
export const getClubRecruitmentFocus = ({
	teamStrategy,
	boardObjectiveKind,
}: {
	teamStrategy: "contending" | "rebuilding";
	boardObjectiveKind?: NonNullable<TeamSeason["boardObjective"]>["kind"];
}): ClubRecruitmentFocus => {
	if (
		boardObjectiveKind === "title" ||
		boardObjectiveKind === "promotion" ||
		boardObjectiveKind === "promotionPlayoff" ||
		boardObjectiveKind === "avoidRelegation"
	) {
		return "current";
	}
	return teamStrategy === "rebuilding" ? "potential" : "current";
};

export const getRecruitmentCandidateScore = ({
	focus,
	value,
	valueNoPot,
}: {
	focus: ClubRecruitmentFocus;
	value: number;
	valueNoPot: number;
}) => (focus === "potential" ? value : valueNoPot);

/**
 * The club's ordered summer work and its intended action for every player.
 * Transfers, loans, and academies can consume this list without inventing
 * their own definition of core players or surplus depth.
 */
export const buildClubSummerPlan = ({
	players,
	season,
	wageBudget,
	minContract,
	minimumRosterSize,
	maxRosterSize,
	rotationSize,
}: {
	players: ClubSquadPlayerInput[];
	season: number;
	wageBudget: number;
	minContract: number;
	minimumRosterSize: number;
	maxRosterSize: number;
	rotationSize: number;
}): ClubSummerPlan => {
	const squadPlan = buildClubSquadPlan({
		rosterValues: players.map((p) => p.valueNoPot),
		wageBudget,
		minContract,
		minimumRosterSize,
		maxRosterSize,
		rotationSize,
	});
	const playersByCurrentAbility = [...players].sort(
		(a, b) => b.valueNoPot - a.valueNoPot,
	);
	const playerActions = playersByCurrentAbility.map((p, index) => {
		const rank = index + 1;
		const role = getRoleForRankInPlan(squadPlan, rank);
		const expiring = p.contract.exp <= season;
		const youngWithUpside =
			p.age <= YOUNG_PLAYER_MAX_AGE &&
			p.value >= p.valueNoPot + YOUNG_PLAYER_POTENTIAL_MARGIN;

		let action: ClubSquadPlayerActionType;
		if (rank <= squadPlan.roles.key.lastRank) {
			action = "core";
		} else if (rank <= minimumRosterSize) {
			action = "retain";
		} else if (expiring && p.contract.amount > minContract) {
			// Do not let a nonessential renewal consume money needed to repair
			// the competitive squad.
			action = "release";
		} else if (youngWithUpside) {
			action = "loan";
		} else if (rank <= squadPlan.targetRosterSize) {
			action = "retain";
		} else if (expiring) {
			action = "release";
		} else {
			action = "transfer";
		}

		return { pid: p.pid, rank, role, action };
	});

	const needs: ClubSquadNeed[] = [];
	const minimumRosterGap = Math.max(0, minimumRosterSize - players.length);
	if (minimumRosterGap > 0) {
		needs.push({
			kind: "fillMinimumRoster",
			priority: 1,
			players: minimumRosterGap,
		});
	}
	const rotationGap = Math.max(0, rotationSize - players.length);
	if (rotationGap > 0) {
		needs.push({
			kind: "repairRotation",
			priority: 2,
			players: rotationGap,
		});
	} else if (players.length >= minimumRosterSize) {
		needs.push({
			kind: "upgradeStarter",
			priority: 2,
			players: 1,
			cutoffValue: squadPlan.roles.starter.cutoffValue,
		});
	}
	const depthGap = Math.max(
		0,
		squadPlan.targetRosterSize - Math.max(players.length, minimumRosterSize),
	);
	if (depthGap > 0) {
		needs.push({ kind: "addDepth", priority: 3, players: depthGap });
	}

	const committed = players.filter((p) => p.contract.exp > season);
	const committedRosterSize = committed.length;
	const committedPayroll = committed.reduce(
		(total, p) => total + p.contract.amount,
		0,
	);
	return {
		squadPlan,
		needs,
		playerActions,
		committedRosterSize,
		committedPayroll,
		minimumContractReserve:
			Math.max(0, minimumRosterSize - committedRosterSize) * minContract,
	};
};
