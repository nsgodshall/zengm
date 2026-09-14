import type { GameAttributesLeague } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	type CompetitionStructure,
	isSingleDivision,
} from "./competitionStructure.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

type PromotionPlayoffGame = NonNullable<
	GameAttributesLeague["promotionPlayoffResults"]
>[number];

export type WorldSeasonSummary = {
	countryId: number;
	name: string;
	divisions: {
		divisionId: number;
		name: string;
		tier: number;
		champion:
			| {
					tid: number;
					points: number;
					won: number;
					lost: number;
					tied: number;
			  }
			| undefined;
		promoted: { tid: number; viaPlayoff: boolean }[];
		relegated: number[];
	}[];
}[];

/**
 * International Soccer Zen GM mod (Epic 6): what happened in each Division of a
 * finished season, by Country and tier, for the Season Summary page: who topped
 * its table, who went up (and whether through a promotion playoff), and who went
 * down. `nextDivisionIdByTid` is each club's Division the season after, and
 * `playoffGames` that season's promotion playoff games.
 */
export const summarizeWorldSeason = ({
	structure,
	tables,
	nextDivisionIdByTid,
	playoffGames,
}: {
	structure: CompetitionStructure;
	tables: Record<number, DivisionTableRow[]>;
	nextDivisionIdByTid: Map<number, number>;
	playoffGames: Pick<PromotionPlayoffGame, "linkId" | "round" | "winnerTid">[];
}): WorldSeasonSummary => {
	const tierByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);

	// The winners of each promotion playoff's last round
	const playoffWinnerTids = new Set<number>();
	for (const link of structure.promotionRelegationLinks) {
		const games = playoffGames.filter((game) => game.linkId === link.id);
		const lastRound = Math.max(...games.map((game) => game.round));
		for (const game of games) {
			if (game.round === lastRound) {
				playoffWinnerTids.add(game.winnerTid);
			}
		}
	}

	return structure.countries.map((country) => ({
		countryId: country.countryId,
		name: country.name,
		divisions: structure.competitionDivisions
			.filter((division) => division.countryId === country.countryId)
			.sort((a, b) => a.tier - b.tier)
			.map((division) => {
				const table = tables[division.divisionId] ?? [];
				const movedTo = (row: DivisionTableRow) => {
					const nextDivisionId = nextDivisionIdByTid.get(row.tid);
					return nextDivisionId === undefined ||
						nextDivisionId === division.divisionId
						? undefined
						: tierByDivisionId.get(nextDivisionId);
				};

				const first = table[0];
				return {
					divisionId: division.divisionId,
					name: division.name,
					tier: division.tier,
					champion:
						first && first.won + first.lost + first.tied > 0
							? {
									tid: first.tid,
									points: first.points,
									won: first.won,
									lost: first.lost,
									tied: first.tied,
								}
							: undefined,
					promoted: table
						.filter((row) => (movedTo(row) ?? Infinity) < division.tier)
						.map((row) => ({
							tid: row.tid,
							viaPlayoff: playoffWinnerTids.has(row.tid),
						})),
					relegated: table
						.filter((row) => (movedTo(row) ?? -Infinity) > division.tier)
						.map((row) => row.tid),
				};
			}),
	}));
};

/**
 * International Soccer Zen GM mod (Epic 6): summarizeWorldSeason for a season
 * whose regular season is over. Undefined outside a World.
 */
export const getWorldSeasonSummary = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	// Clubs keep their Division in their team season, and the end of the season
	// only moves the team, so until next season's team seasons exist the team
	// has where each club is going
	const nextDivisionIdByTid = new Map<number, number>();
	const nextTeamSeasons = await idb.getCopies.teamSeasons(
		{ season: season + 1 },
		"noCopyCache",
	);
	if (nextTeamSeasons.length > 0) {
		for (const teamSeason of nextTeamSeasons) {
			if (teamSeason.divisionId !== undefined) {
				nextDivisionIdByTid.set(teamSeason.tid, teamSeason.divisionId);
			}
		}
	} else if (season === g.get("season")) {
		for (const t of await idb.cache.teams.getAll()) {
			if (!t.disabled && t.divisionId !== undefined) {
				nextDivisionIdByTid.set(t.tid, t.divisionId);
			}
		}
	}

	const playoffGames = (
		(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffResults ??
		[]
	).filter((game) => game.season === season);

	return summarizeWorldSeason({
		structure,
		tables: await getDivisionTables(season),
		nextDivisionIdByTid,
		playoffGames,
	});
};
