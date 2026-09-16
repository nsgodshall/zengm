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
	const lastRankByRole = Object.fromEntries(
		WORLD_SQUAD_ROLES.map((role) => [role, plan.roles[role].lastRank]),
	) as Record<WorldSquadRole, number>;
	const role = getRoleForRank(rank, lastRankByRole);
	const cutoffValue = plan.roles[role].cutoffValue;
	return {
		role,
		rank,
		contractLimit: plan.roles[role].contractLimit,
		improvesRole: cutoffValue === undefined || playerValue > cutoffValue,
	};
};
