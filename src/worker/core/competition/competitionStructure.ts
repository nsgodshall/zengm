import type {
	Conf,
	Div,
	GameAttributesLeague,
	PromotionRelegationLink,
} from "../../../common/types.ts";
import { validatePromotionRelegationLink } from "./resolvePromotionRelegation.ts";

export type CompetitionStructure = {
	countries: NonNullable<GameAttributesLeague["countries"]>;
	competitionDivisions: NonNullable<
		GameAttributesLeague["competitionDivisions"]
	>;
	promotionRelegationLinks: PromotionRelegationLink[];
};

export type ClubDivisionInfo = {
	tid: number;
	divisionId?: number;
	disabled?: boolean;
};

export const DEFAULT_COUNTRY_ID = 0;
export const DEFAULT_DIVISION_ID = 0;

/**
 * The structure a league gets unless it supplies its own: one Country with one
 * tier-1 Division holding every team, and no promotion/relegation. Existing
 * single-league saves migrate to this too, since their conferences/divisions
 * are groupings inside one competition, not tiers of a pyramid.
 */
export const getDefaultCompetitionStructure = (): CompetitionStructure => ({
	countries: [{ countryId: DEFAULT_COUNTRY_ID, name: "World" }],
	competitionDivisions: [
		{
			divisionId: DEFAULT_DIVISION_ID,
			countryId: DEFAULT_COUNTRY_ID,
			tier: 1,
			name: "League",
		},
	],
	promotionRelegationLinks: [],
});

/**
 * A single-Division World is just a normal ZenGM league: its confs/divs are
 * the user's own groupings and stay the source of truth for them. Only a World
 * with more than one Division has its confs/divs derived from the structure
 * (see getLegacyConfsDivs).
 */
export const isSingleDivision = (structure: CompetitionStructure) =>
	structure.competitionDivisions.length === 1;

const assertUniqueIds = <T>(
	items: T[],
	getId: (item: T) => number,
	label: string,
) => {
	const seen = new Set<number>();
	for (const item of items) {
		const id = getId(item);
		if (!Number.isInteger(id) || id < 0) {
			throw new Error(`${label} id must be a non-negative integer, got ${id}`);
		}
		if (seen.has(id)) {
			throw new Error(`Duplicate ${label} id ${id}`);
		}
		seen.add(id);
	}
};

/**
 * Throw if Countries, Divisions, and PromotionRelegationLinks don't form a
 * valid set of pyramids. Doesn't look at clubs — see validateClubDivisions.
 */
export const validateCompetitionStructure = (
	structure: CompetitionStructure,
) => {
	const { countries, competitionDivisions, promotionRelegationLinks } =
		structure;

	if (countries.length === 0) {
		throw new Error("A World needs at least one Country");
	}
	if (competitionDivisions.length === 0) {
		throw new Error("A World needs at least one Division");
	}

	assertUniqueIds(countries, (country) => country.countryId, "Country");
	assertUniqueIds(
		competitionDivisions,
		(division) => division.divisionId,
		"Division",
	);
	assertUniqueIds(
		promotionRelegationLinks,
		(link) => link.id,
		"PromotionRelegationLink",
	);

	const countryIds = new Set(countries.map((country) => country.countryId));
	const divisionsById = new Map(
		competitionDivisions.map((division) => [division.divisionId, division]),
	);

	const tiersByCountryId = new Map<number, Set<number>>();
	for (const division of competitionDivisions) {
		if (!countryIds.has(division.countryId)) {
			throw new Error(
				`Division ${division.divisionId} belongs to Country ${division.countryId}, which doesn't exist`,
			);
		}
		if (!Number.isInteger(division.tier) || division.tier < 1) {
			throw new Error(
				`Division ${division.divisionId}: tier must be an integer >= 1, got ${division.tier}`,
			);
		}
		for (const key of [
			"numGames",
			"winPoints",
			"tiePoints",
			"lossPoints",
		] as const) {
			const value = division[key];
			if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
				throw new Error(
					`Division ${division.divisionId}: ${key} must be a non-negative integer, got ${value}`,
				);
			}
		}

		let tiers = tiersByCountryId.get(division.countryId);
		if (!tiers) {
			tiers = new Set();
			tiersByCountryId.set(division.countryId, tiers);
		}
		tiers.add(division.tier);
	}

	// Every Country's pyramid starts at tier 1 with no gaps. More than one
	// Division on the same tier is allowed, for regional groups later on.
	for (const country of countries) {
		const tiers = tiersByCountryId.get(country.countryId);
		if (!tiers) {
			throw new Error(`Country ${country.countryId} has no Divisions`);
		}
		for (let tier = 1; tier <= tiers.size; tier++) {
			if (!tiers.has(tier)) {
				throw new Error(
					`Country ${country.countryId} has Divisions on tiers ${[...tiers].sort((a, b) => a - b).join(", ")}, but tiers must start at 1 with no gaps`,
				);
			}
		}
	}

	const upperDivisionIdsSeen = new Set<number>();
	const lowerDivisionIdsSeen = new Set<number>();
	for (const link of promotionRelegationLinks) {
		validatePromotionRelegationLink(link);

		const upper = divisionsById.get(link.upperDivisionId);
		const lower = divisionsById.get(link.lowerDivisionId);
		if (!upper) {
			throw new Error(
				`PromotionRelegationLink ${link.id} refers to upper Division ${link.upperDivisionId}, which doesn't exist`,
			);
		}
		if (!lower) {
			throw new Error(
				`PromotionRelegationLink ${link.id} refers to lower Division ${link.lowerDivisionId}, which doesn't exist`,
			);
		}

		if (
			upper.countryId !== link.countryId ||
			lower.countryId !== link.countryId
		) {
			throw new Error(
				`PromotionRelegationLink ${link.id} is for Country ${link.countryId}, but links Division ${upper.divisionId} (Country ${upper.countryId}) and Division ${lower.divisionId} (Country ${lower.countryId})`,
			);
		}

		if (lower.tier !== upper.tier + 1) {
			throw new Error(
				`PromotionRelegationLink ${link.id}: lower Division ${lower.divisionId} (tier ${lower.tier}) must be exactly one tier below upper Division ${upper.divisionId} (tier ${upper.tier})`,
			);
		}

		// resolvePromotionRelegation slices each link's clubs straight off the
		// ends of the tables, so two links sharing a side would pick the same
		// clubs. Regional groups feeding one Division need a smarter resolver.
		if (upperDivisionIdsSeen.has(upper.divisionId)) {
			throw new Error(
				`Division ${upper.divisionId} is the upper Division of more than one PromotionRelegationLink, which isn't supported yet`,
			);
		}
		if (lowerDivisionIdsSeen.has(lower.divisionId)) {
			throw new Error(
				`Division ${lower.divisionId} is the lower Division of more than one PromotionRelegationLink, which isn't supported yet`,
			);
		}
		upperDivisionIdsSeen.add(upper.divisionId);
		lowerDivisionIdsSeen.add(lower.divisionId);
	}
};

/**
 * Throw unless every club is in a Division that exists, every Division has at
 * least one active club, and no Division is too small for the clubs its
 * promotion/relegation rules pick every season. Assumes the structure itself
 * already passed validateCompetitionStructure.
 */
export const validateClubDivisions = (
	structure: CompetitionStructure,
	clubs: ClubDivisionInfo[],
) => {
	const divisionIds = new Set(
		structure.competitionDivisions.map((division) => division.divisionId),
	);

	const missing = clubs
		.filter((club) => club.divisionId === undefined)
		.map((club) => club.tid);
	if (missing.length > 0) {
		throw new Error(
			`Every team needs a divisionId, but these teams don't have one: ${missing.join(", ")}`,
		);
	}

	const numActiveByDivisionId = new Map<number, number>();
	for (const club of clubs) {
		const divisionId = club.divisionId!;
		if (!divisionIds.has(divisionId)) {
			throw new Error(
				`Team ${club.tid} has divisionId ${divisionId}, which doesn't exist`,
			);
		}
		if (!club.disabled) {
			numActiveByDivisionId.set(
				divisionId,
				(numActiveByDivisionId.get(divisionId) ?? 0) + 1,
			);
		}
	}

	for (const division of structure.competitionDivisions) {
		const numActive = numActiveByDivisionId.get(division.divisionId) ?? 0;
		if (numActive === 0) {
			throw new Error(
				`Division ${division.divisionId} (${division.name}) has no active teams`,
			);
		}

		let numPicked = 0;
		for (const link of structure.promotionRelegationLinks) {
			if (link.upperDivisionId === division.divisionId) {
				numPicked += link.numAutoRelegated;
			}
			if (link.lowerDivisionId === division.divisionId) {
				numPicked += link.numAutoPromoted + link.numPromotionPlayoffTeams;
			}
		}
		if (numPicked > numActive) {
			throw new Error(
				`Division ${division.divisionId} (${division.name}) has ${numActive} active team(s), but its promotion/relegation rules pick ${numPicked} of them every season`,
			);
		}
	}
};

/**
 * Work out the competition structure and each club's Division for a league
 * being created, from whatever the league file or new league settings supplied:
 *
 * - Nothing supplied (every upstream league file, every random league): the
 *   default single-Division structure, with every club in it.
 * - A structure supplied: validated, and every club must be in one of its
 *   Divisions — except that a single-Division World puts clubs with no
 *   divisionId into its only Division, since there's nowhere else to go.
 */
export const getNewLeagueCompetition = (
	input: Partial<CompetitionStructure>,
	clubs: ClubDivisionInfo[],
): {
	structure: CompetitionStructure;
	divisionIdByTid: Map<number, number>;
} => {
	if (
		(input.countries === undefined) !==
		(input.competitionDivisions === undefined)
	) {
		throw new Error(
			"countries and competitionDivisions must be provided together",
		);
	}

	if (!input.countries || !input.competitionDivisions) {
		if (
			input.promotionRelegationLinks &&
			input.promotionRelegationLinks.length > 0
		) {
			throw new Error(
				"promotionRelegationLinks were provided without countries and competitionDivisions",
			);
		}

		for (const club of clubs) {
			if (
				club.divisionId !== undefined &&
				club.divisionId !== DEFAULT_DIVISION_ID
			) {
				throw new Error(
					`Team ${club.tid} has divisionId ${club.divisionId}, but no competitionDivisions were provided`,
				);
			}
		}

		return {
			structure: getDefaultCompetitionStructure(),
			divisionIdByTid: new Map(
				clubs.map((club) => [club.tid, DEFAULT_DIVISION_ID]),
			),
		};
	}

	const structure: CompetitionStructure = {
		countries: input.countries,
		competitionDivisions: input.competitionDivisions,
		promotionRelegationLinks: input.promotionRelegationLinks ?? [],
	};
	validateCompetitionStructure(structure);

	let clubsWithDivisions = clubs;
	if (isSingleDivision(structure)) {
		const onlyDivisionId = structure.competitionDivisions[0].divisionId;
		clubsWithDivisions = clubs.map((club) => ({
			...club,
			divisionId: club.divisionId ?? onlyDivisionId,
		}));
	}
	validateClubDivisions(structure, clubsWithDivisions);

	return {
		structure,
		divisionIdByTid: new Map(
			clubsWithDivisions.map((club) => [club.tid, club.divisionId!]),
		),
	};
};

/**
 * International Soccer Zen GM mod (Epic 8): how many games a World's season is
 * when its Divisions set their own `numGames`, for the league-wide `numGames`
 * that finances, contracts, and awards use to know how long a season is. The
 * most common Division `numGames` (the longest if tied), or undefined if no
 * Division sets one, in which case the schedule uses the league-wide setting.
 */
export const getWorldSeasonLength = (structure: CompetitionStructure) => {
	const counts = new Map<number, number>();
	for (const { numGames } of structure.competitionDivisions) {
		if (numGames !== undefined) {
			counts.set(numGames, (counts.get(numGames) ?? 0) + 1);
		}
	}

	let seasonLength: number | undefined;
	let seasonLengthCount = 0;
	for (const [numGames, count] of counts) {
		if (
			count > seasonLengthCount ||
			(count === seasonLengthCount && numGames > seasonLength!)
		) {
			seasonLength = numGames;
			seasonLengthCount = count;
		}
	}
	return seasonLength;
};

/**
 * Until Epics 2/3/6 move standings, scheduling, playoffs, and the UI over to
 * divisionId, the rest of the app only understands confs/divs. For a World
 * with more than one Division, mirror the structure into them — one conference
 * per Country, one division per Division, ordered by Country then tier — so
 * every existing page keeps working and groups clubs correctly.
 */
export const getLegacyConfsDivs = (structure: CompetitionStructure) => {
	const cidByCountryId = new Map(
		structure.countries.map((country, cid) => [country.countryId, cid]),
	);

	const confs = structure.countries.map((country, cid) => {
		const conf: Conf = { cid, name: country.name };
		if (country.abbrev !== undefined) {
			conf.abbrev = country.abbrev;
		}
		return conf;
	}) as GameAttributesLeague["confs"];

	const sortedDivisions = [...structure.competitionDivisions].sort(
		(a, b) =>
			cidByCountryId.get(a.countryId)! - cidByCountryId.get(b.countryId)! ||
			a.tier - b.tier ||
			a.divisionId - b.divisionId,
	);

	const confDivByDivisionId = new Map<number, { cid: number; did: number }>();
	const divs = sortedDivisions.map((division, did) => {
		const cid = cidByCountryId.get(division.countryId)!;
		confDivByDivisionId.set(division.divisionId, { cid, did });

		const div: Div = { cid, did, name: division.name };
		if (division.abbrev !== undefined) {
			div.abbrev = division.abbrev;
		}
		return div;
	}) as GameAttributesLeague["divs"];

	return { confs, divs, confDivByDivisionId };
};

/**
 * Pick a Division for a club joining an existing World (an expansion team, a
 * re-enabled team, or a team that somehow has no divisionId):
 *
 * - the Division it asked for, if that exists
 * - otherwise a single-Division World's only Division
 * - otherwise the Division mirrored by the ZenGM division (did) it asked for,
 *   so the existing "add team" UI, which picks a did, still works
 * - otherwise the bottom tier of the first Country, where a new club starts
 */
export const getDivisionIdForNewClub = (
	structure: CompetitionStructure,
	{ divisionId, did }: { divisionId?: number; did?: number },
) => {
	if (
		divisionId !== undefined &&
		structure.competitionDivisions.some(
			(division) => division.divisionId === divisionId,
		)
	) {
		return divisionId;
	}

	if (isSingleDivision(structure)) {
		return structure.competitionDivisions[0].divisionId;
	}

	if (did !== undefined) {
		for (const [mirroredDivisionId, confDiv] of getLegacyConfsDivs(structure)
			.confDivByDivisionId) {
			if (confDiv.did === did) {
				return mirroredDivisionId;
			}
		}
	}

	const firstCountryId = structure.countries[0].countryId;
	const bottom = structure.competitionDivisions
		.filter((division) => division.countryId === firstCountryId)
		.sort((a, b) => b.tier - a.tier || a.divisionId - b.divisionId)[0];
	if (!bottom) {
		throw new Error(`Country ${firstCountryId} has no Divisions`);
	}
	return bottom.divisionId;
};
