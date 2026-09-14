import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	type CompetitionStructure,
	isSingleDivision,
} from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getPyramidPosition, getTierBands } from "./pyramidPositions.ts";

type DivisionTables = Awaited<ReturnType<typeof getDivisionTables>>;

const getClubsByTier = (
	structure: CompetitionStructure,
	tables: DivisionTables,
	countryId: number,
) => {
	const clubsByTier = new Map<number, number>();
	for (const division of structure.competitionDivisions) {
		if (division.countryId === countryId) {
			clubsByTier.set(
				division.tier,
				(clubsByTier.get(division.tier) ?? 0) +
					(tables[division.divisionId]?.length ?? 0),
			);
		}
	}
	return clubsByTier;
};

// The Division a club was in for a season with that season's tables, and its
// place in the Division and in its Country's pyramid
const getSeasonInfo = (
	structure: CompetitionStructure,
	tables: DivisionTables,
	tid: number,
) => {
	for (const division of structure.competitionDivisions) {
		const table = tables[division.divisionId] ?? [];
		const index = table.findIndex((row) => row.tid === tid);
		if (index < 0) {
			continue;
		}

		const row = table[index]!;
		const clubsByTier = getClubsByTier(structure, tables, division.countryId);
		return {
			divisionId: division.divisionId,
			divisionName: division.name,
			countryId: division.countryId,
			tier: division.tier,
			position: index + 1,
			numClubs: table.length,
			played: row.won + row.lost + row.tied,
			pyramidPosition: getPyramidPosition({
				tier: division.tier,
				position: index + 1,
				clubsByTier,
			}),
			clubsByTier,
		};
	}
};

/**
 * International Soccer Zen GM mod (Epic 6): the Division a club is in for a
 * season and its place in that Division's table, for its team page. Undefined
 * outside a World.
 */
export const getClubDivisionInfo = async (tid: number, season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const info = getSeasonInfo(structure, await getDivisionTables(season), tid);
	if (!info) {
		return;
	}

	return {
		divisionId: info.divisionId,
		divisionName: info.divisionName,
		countryName:
			structure.countries.find(
				(country) => country.countryId === info.countryId,
			)?.name ?? "",
		tier: info.tier,
		position: info.position,
		numClubs: info.numClubs,
		played: info.played,
	};
};

/**
 * International Soccer Zen GM mod (Epic 6): a club's place in its Country's
 * pyramid in every season it has played a game, for the league history chart on
 * its history page, and the places each tier covers (from the club's latest
 * season). Undefined outside a World.
 */
export const getLeagueHistory = async (tid: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teamSeasons = await idb.getCopies.teamSeasons({ tid }, "noCopyCache");
	const currentSeason = g.get("season");
	const currentSeasonOver = g.get("phase") > PHASE.PLAYOFFS;

	const seasons: {
		season: number;
		divisionId: number;
		divisionName: string;
		tier: number;
		position: number;
		numClubs: number;
		pyramidPosition: number;
		inProgress: boolean;
	}[] = [];
	let latest:
		| { clubsByTier: Map<number, number>; countryId: number }
		| undefined;
	for (const teamSeason of teamSeasons.sort((a, b) => a.season - b.season)) {
		if (teamSeason.divisionId === undefined) {
			continue;
		}

		const info = getSeasonInfo(
			structure,
			await getDivisionTables(teamSeason.season),
			tid,
		);
		if (!info || info.played === 0) {
			continue;
		}

		latest = { clubsByTier: info.clubsByTier, countryId: info.countryId };
		seasons.push({
			season: teamSeason.season,
			divisionId: info.divisionId,
			divisionName: info.divisionName,
			tier: info.tier,
			position: info.position,
			numClubs: info.numClubs,
			pyramidPosition: info.pyramidPosition,
			inProgress: teamSeason.season === currentSeason && !currentSeasonOver,
		});
	}

	const bands = latest
		? getTierBands(latest.clubsByTier).map((band) => ({
				...band,
				name:
					structure.competitionDivisions.find(
						(division) =>
							division.countryId === latest.countryId &&
							division.tier === band.tier,
					)?.name ?? `Tier ${band.tier}`,
			}))
		: [];

	return {
		seasons,
		bands,
		numPlaces: bands.at(-1)?.last ?? 0,
	};
};
