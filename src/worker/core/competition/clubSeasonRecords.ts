import type {
	TeamSeasonWithoutKey,
	WorldHistoryEntry,
	WorldSeasonMargin,
	WorldSeasonRecord,
	WorldSeasonRuns,
} from "../../../common/types.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";
import { getPyramidPosition } from "./pyramidPositions.ts";
import type { WorldSeasonSummary } from "./seasonSummary.ts";

// International Soccer Zen GM mod (storytelling): what a World club did each
// season, saved when the season ends, as the facts its history and stories are
// told from (see STORY_TELLING_PLAN.md, Phase 1)

const getEmptyRuns = (): WorldSeasonRuns => ({
	winning: 0,
	unbeaten: 0,
	losing: 0,
	winless: 0,
	longestWinning: 0,
	longestUnbeaten: 0,
	longestLosing: 0,
	longestWinless: 0,
});

/**
 * A club's runs after one more regular season game. A tie ends a winning or
 * losing run but continues an unbeaten or winless one. The biggest win or loss
 * is the first one with the widest margin.
 */
export const updateWorldSeasonRuns = (
	runs: WorldSeasonRuns | undefined,
	{
		result,
		pts,
		oppPts,
		opponentTid,
		gid,
	}: {
		result: "won" | "lost" | "tied";
		pts: number;
		oppPts: number;
		opponentTid: number;
		gid: number;
	},
): WorldSeasonRuns => {
	const next = { ...(runs ?? getEmptyRuns()) };

	next.winning = result === "won" ? next.winning + 1 : 0;
	next.unbeaten = result === "lost" ? 0 : next.unbeaten + 1;
	next.losing = result === "lost" ? next.losing + 1 : 0;
	next.winless = result === "won" ? 0 : next.winless + 1;

	next.longestWinning = Math.max(next.longestWinning, next.winning);
	next.longestUnbeaten = Math.max(next.longestUnbeaten, next.unbeaten);
	next.longestLosing = Math.max(next.longestLosing, next.losing);
	next.longestWinless = Math.max(next.longestWinless, next.winless);

	const game: WorldSeasonMargin = {
		margin: Math.abs(pts - oppPts),
		pts,
		oppPts,
		opponentTid,
		gid,
	};
	if (
		result === "won" &&
		(!next.biggestWin || game.margin > next.biggestWin.margin)
	) {
		next.biggestWin = game;
	} else if (
		result === "lost" &&
		(!next.biggestLoss || game.margin > next.biggestLoss.margin)
	) {
		next.biggestLoss = game;
	}

	return next;
};

type PlayerStatsRow = {
	season: number;
	tid: number;
	playoffs: boolean;
	gp: number;
};

export type ClubSeasonLeaders = Pick<
	WorldSeasonRecord,
	"topScorer" | "mostGames"
>;

/**
 * Each club's top scorer (by `getScore`, the sport's scoring stat for a stats
 * row) and the player who played the most games for it in a regular season.
 * A player with more than one stint at a club that season has them added up.
 * Ties go to the player with more games (or more scoring), then the lower pid.
 */
export const getClubSeasonLeaders = <Row extends PlayerStatsRow>({
	players,
	season,
	getScore,
}: {
	players: {
		pid: number;
		firstName: string;
		lastName: string;
		stats: Row[];
	}[];
	season: number;
	getScore: (row: Row) => number;
}) => {
	type Total = { pid: number; name: string; gp: number; value: number };
	const totalsByTid = new Map<number, Map<number, Total>>();
	for (const p of players) {
		for (const row of p.stats) {
			if (row.season !== season || row.playoffs || row.gp <= 0) {
				continue;
			}
			let totals = totalsByTid.get(row.tid);
			if (!totals) {
				totals = new Map();
				totalsByTid.set(row.tid, totals);
			}
			const total = totals.get(p.pid) ?? {
				pid: p.pid,
				name: `${p.firstName} ${p.lastName}`,
				gp: 0,
				value: 0,
			};
			total.gp += row.gp;
			total.value += getScore(row) || 0;
			totals.set(p.pid, total);
		}
	}

	const leadersByTid = new Map<number, ClubSeasonLeaders>();
	for (const [tid, totals] of totalsByTid) {
		const rows = [...totals.values()];
		const [topScorer] = [...rows].sort(
			(a, b) => b.value - a.value || b.gp - a.gp || a.pid - b.pid,
		);
		const [mostGames] = [...rows].sort(
			(a, b) => b.gp - a.gp || b.value - a.value || a.pid - b.pid,
		);

		const leaders: ClubSeasonLeaders = {};
		if (topScorer && topScorer.value > 0) {
			leaders.topScorer = {
				pid: topScorer.pid,
				name: topScorer.name,
				value: topScorer.value,
			};
		}
		if (mostGames) {
			leaders.mostGames = {
				pid: mostGames.pid,
				name: mostGames.name,
				gp: mostGames.gp,
			};
		}
		leadersByTid.set(tid, leaders);
	}

	return leadersByTid;
};

/**
 * Every World club's record for a finished season, keyed by tid, from the
 * season's final tables and its summary (champions and who went up and down),
 * its promotion playoff games, and its team seasons (squad strength at the
 * first game, board objective, and runs). Clubs that played no games get no
 * record.
 */
export const buildWorldSeasonRecords = ({
	structure,
	tables,
	summary,
	playoffGames,
	teamSeasons,
	leadersByTid,
}: {
	structure: CompetitionStructure;
	tables: Record<number, DivisionTableRow[]>;
	summary: WorldSeasonSummary;
	playoffGames: { homeTid: number; awayTid: number }[];
	teamSeasons: Pick<
		TeamSeasonWithoutKey,
		"tid" | "ovrStart" | "boardObjective" | "worldRuns"
	>[];
	leadersByTid?: Map<number, ClubSeasonLeaders>;
}) => {
	const teamSeasonsByTid = new Map(
		teamSeasons.map((teamSeason) => [teamSeason.tid, teamSeason]),
	);

	const playoffTids = new Set(
		playoffGames.flatMap((game) => [game.homeTid, game.awayTid]),
	);

	const clubsByTierByCountryId = new Map<number, Map<number, number>>();
	for (const division of structure.competitionDivisions) {
		let clubsByTier = clubsByTierByCountryId.get(division.countryId);
		if (!clubsByTier) {
			clubsByTier = new Map();
			clubsByTierByCountryId.set(division.countryId, clubsByTier);
		}
		clubsByTier.set(
			division.tier,
			(clubsByTier.get(division.tier) ?? 0) +
				(tables[division.divisionId]?.length ?? 0),
		);
	}

	const records = new Map<number, WorldSeasonRecord>();
	for (const country of summary) {
		for (const divisionSummary of country.divisions) {
			const division = structure.competitionDivisions.find(
				(division) => division.divisionId === divisionSummary.divisionId,
			);
			const table = tables[divisionSummary.divisionId] ?? [];
			if (!division) {
				continue;
			}

			const promoted = new Map(
				divisionSummary.promoted.map((row) => [row.tid, row.viaPlayoff]),
			);
			const relegated = new Set(divisionSummary.relegated);

			// Squads ranked by strength at their first game
			const squadRankByTid = new Map(
				table
					.map((row) => ({
						tid: row.tid,
						ovrStart: teamSeasonsByTid.get(row.tid)?.ovrStart,
					}))
					.filter(
						(row): row is { tid: number; ovrStart: number } =>
							row.ovrStart !== undefined,
					)
					.sort((a, b) => b.ovrStart - a.ovrStart || a.tid - b.tid)
					.map((row, i) => [row.tid, i + 1]),
			);

			for (const [i, row] of table.entries()) {
				if (row.won + row.lost + row.tied === 0) {
					continue;
				}

				const position = i + 1;
				const teamSeason = teamSeasonsByTid.get(row.tid);
				const record: WorldSeasonRecord = {
					divisionId: division.divisionId,
					countryId: division.countryId,
					tier: division.tier,
					position,
					numClubs: table.length,
					pyramidPosition: getPyramidPosition({
						tier: division.tier,
						position,
						clubsByTier: clubsByTierByCountryId.get(division.countryId)!,
					}),
					points: row.points,
					won: row.won,
					lost: row.lost,
					tied: row.tied,
					pointDiff: row.pointDiff,
					scored: row.scored,
				};

				if (divisionSummary.champion?.tid === row.tid) {
					record.champion = true;
				}
				if (promoted.has(row.tid)) {
					record.moved = "promoted";
				} else if (relegated.has(row.tid)) {
					record.moved = "relegated";
				}
				if (playoffTids.has(row.tid)) {
					record.promotionPlayoff = promoted.get(row.tid) ? "won" : "lost";
				}

				const squadRank = squadRankByTid.get(row.tid);
				if (squadRank !== undefined) {
					record.squadRank = squadRank;
				}
				if (teamSeason?.boardObjective) {
					record.boardObjective = {
						kind: teamSeason.boardObjective.kind,
						targetPosition: teamSeason.boardObjective.targetPosition,
						met: position <= teamSeason.boardObjective.targetPosition,
					};
				}

				const leaders = leadersByTid?.get(row.tid);
				if (leaders?.topScorer) {
					record.topScorer = leaders.topScorer;
				}
				if (leaders?.mostGames) {
					record.mostGames = leaders.mostGames;
				}
				if (teamSeason?.worldRuns) {
					record.runs = teamSeason.worldRuns;
				}

				records.set(row.tid, record);
			}
		}
	}

	return records;
};

/** The short version of a season record that's kept on the club */
export const toWorldHistoryEntry = (
	season: number,
	record: WorldSeasonRecord,
): WorldHistoryEntry => {
	const entry: WorldHistoryEntry = {
		season,
		divisionId: record.divisionId,
		tier: record.tier,
		position: record.position,
		numClubs: record.numClubs,
		pyramidPosition: record.pyramidPosition,
		points: record.points,
	};
	if (record.champion) {
		entry.champion = record.champion;
	}
	if (record.moved) {
		entry.moved = record.moved;
	}
	if (record.promotionPlayoff) {
		entry.promotionPlayoff = record.promotionPlayoff;
	}
	return entry;
};

/**
 * A club's history with a season's entry added, replacing any entry it already
 * had for that season, oldest first
 */
export const addWorldHistoryEntry = (
	history: WorldHistoryEntry[] | undefined,
	entry: WorldHistoryEntry,
) =>
	[
		...(history ?? []).filter((other) => other.season !== entry.season),
		entry,
	].sort((a, b) => a.season - b.season);
