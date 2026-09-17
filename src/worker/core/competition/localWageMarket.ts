import type { Country } from "../../../common/types.ts";
import {
	evaluatePlayerForClubSquadPlan,
	getClubSquadRecruitmentNeed,
	getRecruitmentCandidateScore,
	type ClubRecruitmentFocus,
	type ClubSquadPlan,
	type ClubSquadRecruitmentNeed,
	type WorldSquadRole,
	WORLD_SQUAD_ROLES,
} from "./clubSquadPlan.ts";

export type WorldWageMarketAgeGroup = "prospect" | "prime" | "veteran";

export type WorldWageMarketClub = {
	tid: number;
	countryId: number;
	tier: number;
	capSpace: number;
	plan: ClubSquadPlan;
	focus: ClubRecruitmentFocus;
};

export type WorldWageMarketPlayer = {
	age: number;
	contractAmount: number;
	homeCountryId?: number;
	value: number;
	valueNoPot: number;
};

export type WorldWageMarketInterest = {
	need: ClubSquadRecruitmentNeed;
	role: WorldSquadRole;
	expectedRole: WorldSquadRole;
	local: boolean;
	market: {
		countryId: number;
		tier: number;
		role: WorldSquadRole;
		ageGroup: WorldWageMarketAgeGroup;
	};
	recruitmentScore: number;
};

const roleIndex = (role: WorldSquadRole) => WORLD_SQUAD_ROLES.indexOf(role);

export const getWorldWageMarketAgeGroup = (
	age: number,
): WorldWageMarketAgeGroup =>
	age <= 23 ? "prospect" : age >= 30 ? "veteran" : "prime";

/** Maps the birthplace stored on a player to a World's Country. */
export const getWorldCountryIdByPlayerCountry = (countries: Country[]) => {
	const countryIdByName = new Map<string, number>();
	for (const country of countries) {
		for (const name of [country.name, ...(country.nameCountries ?? [])]) {
			countryIdByName.set(name.toLocaleLowerCase(), country.countryId);
		}
	}
	return countryIdByName;
};

/**
 * A player's asking wage implies the least-important role he will accept at a
 * particular club. The thresholds come from that club's own role budgets, so
 * expectations fall with the asking wage and vary with the market rather than
 * using one global salary cutoff.
 */
export const getWorldWageExpectedRole = ({
	contractAmount,
	plan,
}: {
	contractAmount: number;
	plan: ClubSquadPlan;
}): WorldSquadRole => {
	if (contractAmount > plan.roles.starter.contractLimit) {
		return "key";
	}
	if (contractAmount > plan.roles.rotation.contractLimit) {
		return "starter";
	}
	if (contractAmount > plan.roles.depth.contractLimit) {
		return "rotation";
	}
	return "depth";
};

/**
 * The number of distinct players for whom a club can express interest in one
 * market round. It is its observable squad vacancy, with one bid available to
 * a complete club that has a genuine upgrade opportunity.
 */
export const getWorldWageMarketBidLimit = (plan: ClubSquadPlan) => {
	if (plan.openRosterSlots > 0) {
		return plan.openRosterSlots;
	}
	return plan.rosterSize > 0 ? 1 : plan.minimumRosterSize;
};

export const getWorldWageMarketRecruitmentScore = ({
	focus,
	value,
	valueNoPot,
	local,
}: {
	focus: ClubRecruitmentFocus;
	value: number;
	valueNoPot: number;
	local: boolean;
}) => {
	const baseScore = getRecruitmentCandidateScore({
		focus,
		value,
		valueNoPot,
	});
	return baseScore + (local ? Math.max(1, Math.abs(baseScore) * 0.05) : 0);
};

/**
 * Returns a club's actual market for a player, or undefined when the club
 * would not make the signing. Country, tier, offered role, age group, and the
 * club's current squad need remain visible in the returned interest instead
 * of being flattened into a global pool.
 */
export const getWorldWageMarketInterest = ({
	club,
	player,
}: {
	club: WorldWageMarketClub;
	player: WorldWageMarketPlayer;
}): WorldWageMarketInterest | undefined => {
	if (player.contractAmount > club.capSpace) {
		return;
	}

	const evaluation = evaluatePlayerForClubSquadPlan({
		plan: club.plan,
		playerValue: player.valueNoPot,
	});
	if (player.contractAmount > evaluation.contractLimit) {
		return;
	}

	const need = getClubSquadRecruitmentNeed({
		plan: club.plan,
		playerValue: player.valueNoPot,
	});
	if (need === undefined) {
		return;
	}

	const expectedRole = getWorldWageExpectedRole({
		contractAmount: player.contractAmount,
		plan: club.plan,
	});
	if (roleIndex(evaluation.role) > roleIndex(expectedRole)) {
		return;
	}

	const local = player.homeCountryId === club.countryId;
	const recruitmentScore = getWorldWageMarketRecruitmentScore({
		focus: club.focus,
		value: player.value,
		valueNoPot: player.valueNoPot,
		local,
	});

	return {
		need,
		role: evaluation.role,
		expectedRole,
		local,
		market: {
			countryId: club.countryId,
			tier: club.tier,
			role: evaluation.role,
			ageGroup: getWorldWageMarketAgeGroup(player.age),
		},
		recruitmentScore,
	};
};
