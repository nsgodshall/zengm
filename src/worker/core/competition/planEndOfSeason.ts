import type { Division } from "../../../common/types.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";
import runPromotionPlayoff from "./promotionPlayoff.ts";
import resolvePromotionRelegation, {
	flattenPromotionRelegationMoves,
	type ResolvedPromotionRelegationMove,
} from "./resolvePromotionRelegation.ts";

export type EndOfSeasonPlan = {
	// Each Division's table winner
	champions: { division: Division; row: DivisionTableRow }[];
	moves: ResolvedPromotionRelegationMove[];
	// Clubs promoted by winning a promotion playoff rather than automatically
	playoffWinnerTids: Set<number>;
};

/**
 * Work out how a World's season ends from its final Division tables: each
 * Division's champion, the winners of any promotion playoffs (each game played
 * with `playGame`, which is told the link and round and returns the winner's
 * tid), and every club moving up or down for next season.
 */
const planEndOfSeason = async (
	structure: CompetitionStructure,
	tables: Record<number, DivisionTableRow[]>,
	playGame: (
		homeTid: number,
		awayTid: number,
		game: { linkId: number; round: number },
	) => Promise<number>,
): Promise<EndOfSeasonPlan> => {
	const champions: EndOfSeasonPlan["champions"] = [];
	for (const division of structure.competitionDivisions) {
		const row = tables[division.divisionId]?.[0];
		if (row) {
			champions.push({ division, row });
		}
	}

	const results = resolvePromotionRelegation(
		structure.promotionRelegationLinks,
		tables,
	);

	const playoffWinnersByLinkId: Record<number, number[]> = {};
	for (const result of results) {
		if (result.numPromotionPlayoffSpots > 0) {
			playoffWinnersByLinkId[result.linkId] = await runPromotionPlayoff(
				result.promotionPlayoffParticipants,
				result.numPromotionPlayoffSpots,
				(homeTid, awayTid, round) =>
					playGame(homeTid, awayTid, { linkId: result.linkId, round }),
			);
		}
	}

	return {
		champions,
		moves: flattenPromotionRelegationMoves(results, playoffWinnersByLinkId),
		playoffWinnerTids: new Set(Object.values(playoffWinnersByLinkId).flat()),
	};
};

export default planEndOfSeason;
