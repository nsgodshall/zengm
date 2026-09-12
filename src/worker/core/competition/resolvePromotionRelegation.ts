import type { PromotionRelegationLink } from "../../../common/types.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";

export type PromotionRelegationResult = {
	linkId: number;
	upperDivisionId: number;
	lowerDivisionId: number;
	autoPromoted: number[];
	autoRelegated: number[];
	// Clubs from the lower Division, ranked just below the auto-promotion
	// cutoff, who still need a promotion playoff resolved before their move is
	// final. Empty when the link has no playoff (numPromotionPlayoffTeams=0).
	// Resolving the playoff itself needs actual match simulation, so that's
	// Epic 3's job, not this pure function's.
	promotionPlayoffParticipants: number[];
	// How many of promotionPlayoffParticipants go up once the playoff is
	// played. Carried on the result so flattenPromotionRelegationMoves can check
	// the playoff winners it's handed.
	numPromotionPlayoffSpots: number;
};

const COUNT_KEYS = [
	"numAutoPromoted",
	"numAutoRelegated",
	"numPromotionPlayoffTeams",
	"numPromotionPlayoffSpots",
] as const;

/**
 * Throw if a PromotionRelegationLink can't be applied without breaking the
 * pyramid. Most importantly, the number of clubs going up (auto-promoted plus
 * playoff winners) must equal the number coming down, otherwise both
 * Divisions change size every season and drift further apart over a long save.
 */
export const validatePromotionRelegationLink = (
	link: PromotionRelegationLink,
) => {
	for (const key of COUNT_KEYS) {
		const value = link[key];
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(
				`PromotionRelegationLink ${link.id}: ${key} must be a non-negative integer, got ${value}`,
			);
		}
	}

	if (link.upperDivisionId === link.lowerDivisionId) {
		throw new Error(
			`PromotionRelegationLink ${link.id}: upperDivisionId and lowerDivisionId are both ${link.upperDivisionId}`,
		);
	}

	if (link.numPromotionPlayoffSpots > link.numPromotionPlayoffTeams) {
		throw new Error(
			`PromotionRelegationLink ${link.id}: ${link.numPromotionPlayoffSpots} promotion playoff spot(s) but only ${link.numPromotionPlayoffTeams} playoff team(s)`,
		);
	}

	if (
		link.numPromotionPlayoffTeams > 0 &&
		link.numPromotionPlayoffSpots === 0
	) {
		throw new Error(
			`PromotionRelegationLink ${link.id}: has ${link.numPromotionPlayoffTeams} promotion playoff team(s) but no promotion playoff spots`,
		);
	}

	const numUp = link.numAutoPromoted + link.numPromotionPlayoffSpots;
	if (numUp !== link.numAutoRelegated) {
		throw new Error(
			`PromotionRelegationLink ${link.id} is unbalanced: ${numUp} club(s) go up (${link.numAutoPromoted} automatic + ${link.numPromotionPlayoffSpots} via playoff) but ${link.numAutoRelegated} come down, so Division sizes would change every season`,
		);
	}
};

// In a pyramid with 3+ tiers, a middle Division is the lower side of one link
// and the upper side of another. If it's too small, the same club gets picked
// to go up and down at once. Also catches a club appearing in two tables.
const assertNoClubPickedTwice = (results: PromotionRelegationResult[]) => {
	const linkIdByTid = new Map<number, number>();
	for (const result of results) {
		for (const tid of [
			...result.autoPromoted,
			...result.autoRelegated,
			...result.promotionPlayoffParticipants,
		]) {
			const prevLinkId = linkIdByTid.get(tid);
			if (prevLinkId !== undefined) {
				throw new Error(
					`Club ${tid} is picked more than once for promotion/relegation (link ${prevLinkId}, then link ${result.linkId}). Either it appears in more than one table, or a Division is too small for the number of clubs moving up and down.`,
				);
			}
			linkIdByTid.set(tid, result.linkId);
		}
	}
};

/**
 * Given final Division tables (ordered, rank 1 first — see
 * computeDivisionTable) and the PromotionRelegationLinks connecting them,
 * work out which clubs move automatically and which clubs are merely in
 * contention for the remaining promotion spot(s) via playoff.
 */
const resolvePromotionRelegation = (
	links: PromotionRelegationLink[],
	tables: Record<number, DivisionTableRow[]>,
): PromotionRelegationResult[] => {
	const results = links.map((link) => {
		validatePromotionRelegationLink(link);

		const upperTable = tables[link.upperDivisionId];
		const lowerTable = tables[link.lowerDivisionId];

		if (!upperTable || !lowerTable) {
			throw new Error(
				`Missing table for PromotionRelegationLink ${link.id} (upperDivisionId=${link.upperDivisionId}, lowerDivisionId=${link.lowerDivisionId})`,
			);
		}

		if (upperTable.length < link.numAutoRelegated) {
			throw new Error(
				`PromotionRelegationLink ${link.id}: upper Division ${link.upperDivisionId} has ${upperTable.length} club(s) but ${link.numAutoRelegated} are supposed to be relegated`,
			);
		}

		const numLowerPicked = link.numAutoPromoted + link.numPromotionPlayoffTeams;
		if (lowerTable.length < numLowerPicked) {
			throw new Error(
				`PromotionRelegationLink ${link.id}: lower Division ${link.lowerDivisionId} has ${lowerTable.length} club(s) but ${numLowerPicked} are needed (${link.numAutoPromoted} automatic promotion + ${link.numPromotionPlayoffTeams} playoff)`,
			);
		}

		const autoPromoted = lowerTable
			.slice(0, link.numAutoPromoted)
			.map((row) => row.tid);

		const autoRelegated = upperTable
			.slice(upperTable.length - link.numAutoRelegated)
			.map((row) => row.tid);

		const promotionPlayoffParticipants = lowerTable
			.slice(link.numAutoPromoted, numLowerPicked)
			.map((row) => row.tid);

		return {
			linkId: link.id,
			upperDivisionId: link.upperDivisionId,
			lowerDivisionId: link.lowerDivisionId,
			autoPromoted,
			autoRelegated,
			promotionPlayoffParticipants,
			numPromotionPlayoffSpots: link.numPromotionPlayoffSpots,
		};
	});

	assertNoClubPickedTwice(results);

	return results;
};

export type ResolvedPromotionRelegationMove = {
	tid: number;
	fromDivisionId: number;
	toDivisionId: number;
};

/**
 * Flatten resolved PromotionRelegationResults, plus (for any link that had a
 * playoff) the playoff's winning tids keyed by linkId, into a plain list of
 * tid -> divisionId moves ready to apply to Team/TeamSeason records.
 *
 * Every link with promotion playoff spots must have exactly that many winners,
 * all drawn from its playoff participants — otherwise the moves wouldn't
 * balance and Division sizes would drift.
 */
export const flattenPromotionRelegationMoves = (
	results: PromotionRelegationResult[],
	playoffWinnersByLinkId: Record<number, number[]> = {},
): ResolvedPromotionRelegationMove[] => {
	const linkIds = new Set(results.map((result) => result.linkId));
	for (const key of Object.keys(playoffWinnersByLinkId)) {
		if (!linkIds.has(Number(key))) {
			throw new Error(
				`Promotion playoff winners given for link ${key}, which has no PromotionRelegationResult`,
			);
		}
	}

	const moves: ResolvedPromotionRelegationMove[] = [];

	for (const result of results) {
		const playoffWinners = playoffWinnersByLinkId[result.linkId] ?? [];

		if (playoffWinners.length !== result.numPromotionPlayoffSpots) {
			throw new Error(
				`PromotionRelegationLink ${result.linkId}: expected ${result.numPromotionPlayoffSpots} promotion playoff winner(s), got ${playoffWinners.length}`,
			);
		}

		if (new Set(playoffWinners).size !== playoffWinners.length) {
			throw new Error(
				`PromotionRelegationLink ${result.linkId}: duplicate promotion playoff winners ${JSON.stringify(playoffWinners)}`,
			);
		}

		for (const tid of playoffWinners) {
			if (!result.promotionPlayoffParticipants.includes(tid)) {
				throw new Error(
					`PromotionRelegationLink ${result.linkId}: club ${tid} won the promotion playoff but wasn't one of its participants`,
				);
			}
		}

		for (const tid of result.autoPromoted) {
			moves.push({
				tid,
				fromDivisionId: result.lowerDivisionId,
				toDivisionId: result.upperDivisionId,
			});
		}

		for (const tid of result.autoRelegated) {
			moves.push({
				tid,
				fromDivisionId: result.upperDivisionId,
				toDivisionId: result.lowerDivisionId,
			});
		}

		for (const tid of playoffWinners) {
			moves.push({
				tid,
				fromDivisionId: result.lowerDivisionId,
				toDivisionId: result.upperDivisionId,
			});
		}
	}

	return moves;
};

export default resolvePromotionRelegation;
