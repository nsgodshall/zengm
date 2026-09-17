import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import type { HeadToHead } from "../../../common/types.ts";
import computeDivisionTable, {
	type ClubSeasonResult,
	type DivisionTableOptions,
	type DivisionTableRow,
	type HeadToHeadRecord,
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
	getHeadToHead?: DivisionTableOptions["getHeadToHead"],
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
		tables[division.divisionId] = computeDivisionTable(
			resultsByDivisionId.get(division.divisionId)!,
			{
				winPoints: division.winPoints,
				tiePoints: division.tiePoints,
				lossPoints: division.lossPoints,
				getHeadToHead,
			},
		);
	}

	return tables;
};

// headToHeads stores one regular season record per pair of clubs, under the
// lower tid, from that club's point of view. Overtime results are separate, and
// count as wins and losses here.
const makeGetHeadToHead =
	(headToHead: HeadToHead | undefined) =>
	(tid: number, otherTid: number): HeadToHeadRecord | undefined => {
		const lowTid = Math.min(tid, otherTid);
		const highTid = Math.max(tid, otherTid);
		const record = headToHead?.regularSeason[lowTid]?.[highTid];
		if (!record) {
			return undefined;
		}

		const lowRecord = {
			won: record.won + record.otw,
			lost: record.lost + record.otl,
			tied: record.tied,
		};

		return tid === lowTid
			? lowRecord
			: { won: lowRecord.lost, lost: lowRecord.won, tied: lowRecord.tied };
	};

/**
 * The current league's tables for a season, one per Division, from each club's
 * regular season record and head-to-head results. Points for and against stand
 * in for goals: every sport's team stats have pts/oppPts. Overtime losses count
 * as losses.
 */
export const getDivisionTables = async (season: number) => {
	const structure = getCompetitionStructure();

	// Storytelling (Phase 6c): points taken off a club in administration
	const deductionsByTid = new Map(
		(await idb.cache.teams.getAll()).map((t) => [
			t.tid,
			(t.worldPointsDeductions ?? []).find((row) => row.season === season)
				?.points,
		]),
	);

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: ["won", "lost", "tied", "otl", "did", "divisionId"],
			stats: ["pts", "oppPts"],
			season,
			regularSeason: true,
			playoffs: false,
			statType: "totals",
			showNoStats: true,
		},
		"noCopyCache",
	);

	const headToHead =
		season === g.get("season")
			? await idb.cache.headToHeads.get(season)
			: await idb.league.get("headToHeads", season);

	return buildDivisionTables(
		structure,
		teams.map((t) => ({
			tid: t.tid,
			divisionId:
				t.seasonAttrs.divisionId ??
				getDivisionIdForNewClub(structure, t.seasonAttrs),
			won: t.seasonAttrs.won,
			lost: t.seasonAttrs.lost + (t.seasonAttrs.otl ?? 0),
			tied: t.seasonAttrs.tied,
			pointDiff: t.stats.pts - t.stats.oppPts,
			scored: t.stats.pts,
			pointsDeduction: deductionsByTid.get(t.tid),
		})),
		makeGetHeadToHead(headToHead),
	);
};
