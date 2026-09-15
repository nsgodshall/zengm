import type { GameAttributesLeague } from "../../../common/types.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * International Soccer Zen GM mod (Epic 6): each promotion playoff in a World
 * for a season, for the playoffs page. Every playoff's participants come from
 * its lower Division's table (the clubs in its promotion playoff places,
 * seeded by position), with the games played so far round by round (see
 * promotionPlayoffResults, saved at the end of the season). Undefined outside a
 * World.
 */
const getPromotionPlayoffBrackets = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const results = (
		(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffResults ??
		[]
	).filter((game) => game.season === season);

	const tables = await getDivisionTables(season);

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: ["abbrev", "region", "name", "imgURL", "imgURLSmall"],
			season,
			showNoStats: true,
		},
		"noCopyCache",
	);
	const teamByTid = new Map(teams.map((t) => [t.tid, t.seasonAttrs]));

	return structure.promotionRelegationLinks
		.filter(
			(link) =>
				link.numPromotionPlayoffTeams > 0 && link.numPromotionPlayoffSpots > 0,
		)
		.map((link) => {
			const division = structure.competitionDivisions.find(
				(division) => division.divisionId === link.lowerDivisionId,
			);
			const upperDivision = structure.competitionDivisions.find(
				(division) => division.divisionId === link.upperDivisionId,
			);
			const country = structure.countries.find(
				(country) => country.countryId === link.countryId,
			);

			const table = tables[link.lowerDivisionId] ?? [];
			const seedByTid = new Map(table.map((row) => [row.tid, row.rank]));

			const club = (tid: number) => {
				const t = teamByTid.get(tid);
				return {
					tid,
					seed: seedByTid.get(tid),
					abbrev: t?.abbrev ?? "",
					region: t?.region ?? "",
					name: t?.name ?? "",
					imgURL: t?.imgURL ?? "",
					imgURLSmall: t?.imgURLSmall,
				};
			};

			const games = results.filter((game) => game.linkId === link.id);
			const numRounds = Math.max(0, ...games.map((game) => game.round + 1));

			return {
				countryName: country?.name ?? "",
				divisionName: division?.name ?? "",
				linkId: link.id,
				numSpots: link.numPromotionPlayoffSpots,
				participants: table
					.slice(
						link.numAutoPromoted,
						link.numAutoPromoted + link.numPromotionPlayoffTeams,
					)
					.map((row) => club(row.tid)),
				rounds: range(numRounds).map((round) =>
					games
						.filter((game) => game.round === round)
						.map((game) => ({
							gid: game.gid,
							home: { ...club(game.homeTid), pts: game.homePts },
							away: { ...club(game.awayTid), pts: game.awayPts },
							winnerTid: game.winnerTid,
						})),
				),
				upperDivisionName: upperDivision?.name ?? "",
			};
		});
};

export default getPromotionPlayoffBrackets;
