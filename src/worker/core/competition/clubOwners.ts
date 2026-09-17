import type { Team } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 6c): who owns a World club, decided with the user. A rich benefactor's
// takeover funds a challenger; an owner losing interest leaves a club to live
// on its own money again. Owners are checked each summer, after promotion and
// relegation.

export type ClubOwnerKind =
	| "local"
	| "benefactor"
	| "investmentGroup"
	| "fanOwned";

export type ClubOwner = NonNullable<Team["worldOwner"]>;

export const CLUB_OWNER_SETTINGS = {
	// How likely each kind is when a club gets a new owner
	kindWeights: {
		local: 4,
		benefactor: 2,
		investmentGroup: 3,
		fanOwned: 1,
	} satisfies Record<ClubOwnerKind, number>,
	// The chance a club is taken over in a summer, before the reasons below
	takeoverChance: 0.015,
	// A big club outside the top tier, or one whose stature its league place
	// doesn't match, attracts buyers this much more
	sleepingGiantFactor: 3,
	sleepingGiantStature: 60,
	// A club whose debt is past this much of its revenue attracts a rescue
	distressDebtRevenue: 1,
	distressFactor: 2.5,
	// Champions are rarely sold
	championFactor: 0.4,
	// What a benefactor puts in each season, as a fraction of the club's
	// revenue, and for how many seasons
	fundingRevenueShare: [0.3, 0.8] as const,
	fundingSeasons: [3, 8] as const,
	// How much debt each kind of owner will cover, as a multiple of revenue,
	// before a club goes into administration
	debtLimitByKind: {
		local: 1,
		benefactor: 3,
		investmentGroup: 1.5,
		fanOwned: 0.75,
	} satisfies Record<ClubOwnerKind, number>,
};

export const OWNER_KIND_LABELS: Record<ClubOwnerKind, string> = {
	local: "Local owner",
	benefactor: "Wealthy benefactor",
	investmentGroup: "Investment group",
	fanOwned: "Fan owned",
};

/** How much debt a club's owner will cover, in thousands of dollars */
export const getOwnerDebtLimit = ({
	owner,
	revenue,
}: {
	owner: ClubOwner | undefined;
	revenue: number;
}) =>
	CLUB_OWNER_SETTINGS.debtLimitByKind[owner?.kind ?? "local"] *
	Math.max(0, revenue);

/** What a club's owner puts in this season, in thousands of dollars */
export const getOwnerFunding = (owner: ClubOwner | undefined) =>
	owner && owner.seasonsLeft !== undefined && owner.seasonsLeft > 0
		? owner.fundingPerSeason
		: 0;

const pick = <T extends string>(
	weights: Record<T, number>,
	random: () => number,
) => {
	const entries = Object.entries(weights) as [T, number][];
	const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
	let value = random() * total;
	for (const [key, weight] of entries) {
		value -= weight;
		if (value <= 0) {
			return key;
		}
	}
	return entries.at(-1)![0];
};

/**
 * How likely a club is to be taken over this summer: sleeping giants and clubs
 * deep in debt attract buyers, champions rarely change hands
 */
export const getTakeoverChance = ({
	stature,
	tier,
	cash,
	revenue,
	champion,
}: {
	stature: number;
	tier: number;
	cash: number;
	revenue: number;
	champion: boolean;
}) => {
	const settings = CLUB_OWNER_SETTINGS;
	let chance = settings.takeoverChance;
	if (tier > 1 && stature >= settings.sleepingGiantStature) {
		chance *= settings.sleepingGiantFactor;
	}
	if (cash < -settings.distressDebtRevenue * Math.max(0, revenue)) {
		chance *= settings.distressFactor;
	}
	if (champion) {
		chance *= settings.championFactor;
	}
	return Math.min(1, chance);
};

/**
 * A club's owner after a summer: a takeover, a benefactor's money running out,
 * or no change. `random` is uniform on [0, 1).
 */
export const getNextOwner = ({
	owner,
	season,
	revenue,
	takeover,
	random,
}: {
	owner: ClubOwner | undefined;
	season: number;
	revenue: number;
	// Whether the club is taken over this summer
	takeover: boolean;
	random: () => number;
}): { owner: ClubOwner; change: "takeover" | "fundingOver" | undefined } => {
	const settings = CLUB_OWNER_SETTINGS;

	if (takeover) {
		const kind = pick(settings.kindWeights, random);
		const [minShare, maxShare] = settings.fundingRevenueShare;
		const [minSeasons, maxSeasons] = settings.fundingSeasons;
		const funding =
			kind === "benefactor"
				? {
						fundingPerSeason: Math.round(
							(minShare + random() * (maxShare - minShare)) *
								Math.max(0, revenue),
						),
						seasonsLeft:
							minSeasons + Math.floor(random() * (maxSeasons - minSeasons + 1)),
					}
				: { fundingPerSeason: 0, seasonsLeft: 0 };
		return {
			owner: { kind, since: season, ...funding },
			change: "takeover",
		};
	}

	if (!owner) {
		return {
			owner: {
				kind: pick(settings.kindWeights, random),
				since: season,
				fundingPerSeason: 0,
				seasonsLeft: 0,
			},
			change: undefined,
		};
	}

	if (owner.seasonsLeft !== undefined && owner.seasonsLeft > 0) {
		const seasonsLeft = owner.seasonsLeft - 1;
		return {
			owner: { ...owner, seasonsLeft },
			change: seasonsLeft === 0 ? "fundingOver" : undefined,
		};
	}

	return { owner, change: undefined };
};
