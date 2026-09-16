export type WorldSquadRole = "key" | "starter" | "rotation" | "depth";

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

export const getIntendedSquadRole = ({
	playerValue,
	rosterValues,
}: {
	playerValue: number;
	rosterValues: number[];
}): WorldSquadRole => {
	const rank = 1 + rosterValues.filter((value) => value > playerValue).length;
	if (rank <= 3) {
		return "key";
	}
	if (rank <= 11) {
		return "starter";
	}
	if (rank <= 14) {
		return "rotation";
	}
	return "depth";
};

/**
 * The most a lower-tier club should put into one new contract. This is a
 * concentration limit in addition to the ordinary payroll/wage-budget check.
 */
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

export const getWorldNewContractLimitForPlayer = ({
	wageBudget,
	minContract,
	playerValue,
	rosterValues,
}: {
	wageBudget: number;
	minContract: number;
	playerValue: number;
	rosterValues: number[];
}) => {
	const role = getIntendedSquadRole({ playerValue, rosterValues });
	return {
		role,
		limit: getWorldNewContractLimit({ wageBudget, minContract, role }),
	};
};
