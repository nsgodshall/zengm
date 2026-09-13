import type { CompetitionStructure } from "./competitionStructure.ts";

export type TableZone = "promotion" | "promotionPlayoff" | "relegation";

/**
 * What each position in a Division's table leads to at the end of the season,
 * from its PromotionRelegationLinks, indexed by position (0 is top). The top
 * places go up automatically and the next ones go to the promotion playoff when
 * the Division is the lower side of a link; the bottom places go down when it's
 * the upper side. Positions with nothing riding on them are undefined.
 */
export const getTableZones = (
	structure: CompetitionStructure,
	divisionId: number,
	numClubs: number,
): (TableZone | undefined)[] => {
	const zones: (TableZone | undefined)[] = Array.from({ length: numClubs });

	for (const link of structure.promotionRelegationLinks) {
		if (link.lowerDivisionId === divisionId) {
			for (let i = 0; i < link.numAutoPromoted && i < numClubs; i++) {
				zones[i] = "promotion";
			}
			for (
				let i = link.numAutoPromoted;
				i < link.numAutoPromoted + link.numPromotionPlayoffTeams &&
				i < numClubs;
				i++
			) {
				zones[i] = "promotionPlayoff";
			}
		}

		if (link.upperDivisionId === divisionId) {
			for (
				let i = Math.max(0, numClubs - link.numAutoRelegated);
				i < numClubs;
				i++
			) {
				zones[i] = "relegation";
			}
		}
	}

	return zones;
};

export type FormResult = "W" | "D" | "L";

/**
 * A club's results in its last `numGames` games, oldest first, from a season's
 * games in any order. A game with equal scores is a draw.
 */
export const getRecentForm = (
	games: {
		gid: number;
		day?: number;
		won: { tid: number; pts: number };
		lost: { tid: number; pts: number };
	}[],
	tid: number,
	numGames: number,
): FormResult[] => {
	const clubGames = games
		.filter((game) => game.won.tid === tid || game.lost.tid === tid)
		.sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.gid - b.gid);

	return clubGames.slice(-numGames).map((game) => {
		if (game.won.pts === game.lost.pts) {
			return "D";
		}
		return game.won.tid === tid ? "W" : "L";
	});
};

/**
 * The order to show a World's Divisions in: the user's Division first, then
 * the rest of the user's Country, then every other Country, each Country's
 * Divisions by tier. With no user Division, just Countries in order, by tier.
 */
export const orderDivisionsForDisplay = (
	structure: CompetitionStructure,
	userDivisionId: number | undefined,
) => {
	const userCountryId = structure.competitionDivisions.find(
		(division) => division.divisionId === userDivisionId,
	)?.countryId;

	const countryOrder = new Map(
		structure.countries.map((country, i) => [country.countryId, i]),
	);

	const sortKey = (
		division: CompetitionStructure["competitionDivisions"][number],
	) => [
		division.divisionId === userDivisionId ? 0 : 1,
		division.countryId === userCountryId ? 0 : 1,
		countryOrder.get(division.countryId) ?? Infinity,
		division.tier,
	];

	return [...structure.competitionDivisions].sort((a, b) => {
		const keyA = sortKey(a);
		const keyB = sortKey(b);
		for (let i = 0; i < keyA.length; i++) {
			if (keyA[i] !== keyB[i]) {
				return keyA[i]! - keyB[i]!;
			}
		}
		return 0;
	});
};
