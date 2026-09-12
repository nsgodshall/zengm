import { idb } from "../../db/index.ts";
import computeDivisionTable, {
	type ClubSeasonResult,
	type DivisionTableOptions,
	type DivisionTableRow,
} from "./computeDivisionTable.ts";
import {
	type CompetitionStructure,
	getDivisionIdForNewClub,
} from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * One table per Division, keyed by divisionId, from every club's season
 * results. Every Division gets a table, even one with no clubs, so
 * resolvePromotionRelegation can count on it being there. Each Division's own
 * winPoints/tiePoints/lossPoints apply.
 */
export const buildDivisionTables = (
	structure: CompetitionStructure,
	results: (ClubSeasonResult & { divisionId: number })[],
): Record<number, DivisionTableRow[]> => {
	const resultsByDivisionId = new Map<number, ClubSeasonResult[]>(
		structure.competitionDivisions.map((division) => [division.divisionId, []]),
	);
	for (const { divisionId, ...result } of results) {
		const divisionResults = resultsByDivisionId.get(divisionId);
		if (!divisionResults) {
			throw new Error(
				`Team ${result.tid} is in Division ${divisionId}, which doesn't exist`,
			);
		}
		divisionResults.push(result);
	}

	const tables: Record<number, DivisionTableRow[]> = {};
	for (const division of structure.competitionDivisions) {
		// Only pass the ones that are set, so computeDivisionTable's defaults
		// apply to the rest
		const options: DivisionTableOptions = {};
		if (division.winPoints !== undefined) {
			options.winPoints = division.winPoints;
		}
		if (division.tiePoints !== undefined) {
			options.tiePoints = division.tiePoints;
		}
		if (division.lossPoints !== undefined) {
			options.lossPoints = division.lossPoints;
		}

		tables[division.divisionId] = computeDivisionTable(
			resultsByDivisionId.get(division.divisionId)!,
			options,
		);
	}

	return tables;
};

/**
 * The current league's tables for a season, one per Division, from each club's
 * regular season record. Points for and against stand in for goals: every
 * sport's team stats have pts/oppPts.
 */
export const getDivisionTables = async (season: number) => {
	const structure = getCompetitionStructure();

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: ["won", "lost", "tied", "did", "divisionId"],
			stats: ["pts", "oppPts"],
			season,
			regularSeason: true,
			playoffs: false,
			statType: "totals",
			showNoStats: true,
		},
		"noCopyCache",
	);

	return buildDivisionTables(
		structure,
		teams.map((t) => ({
			tid: t.tid,
			divisionId:
				t.seasonAttrs.divisionId ??
				getDivisionIdForNewClub(structure, t.seasonAttrs),
			won: t.seasonAttrs.won,
			lost: t.seasonAttrs.lost,
			tied: t.seasonAttrs.tied,
			pointDiff: t.stats.pts - t.stats.oppPts,
			scored: t.stats.pts,
		})),
	);
};
