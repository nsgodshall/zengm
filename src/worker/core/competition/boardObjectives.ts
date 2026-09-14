import type { TeamSeason } from "../../../common/types.ts";

/**
 * International Soccer Zen GM mod (Epic 6): board objectives, like Football
 * Manager's. Each season a club's board expects it to finish a little below
 * its squad's strength rank in its Division, and names that target by the part
 * of the table it's in.
 */
export type BoardObjective = NonNullable<TeamSeason["boardObjective"]>;

export const BOARD_OBJECTIVE_LABELS: Record<BoardObjective["kind"], string> = {
	title: "Challenge for the title",
	promotion: "Win promotion",
	promotionPlayoff: "Reach the promotion playoffs",
	topHalf: "Finish in the top half",
	midTable: "Finish mid-table",
	avoidRelegation: "Avoid relegation",
};

/**
 * A club's objective from `strengthRank`, its squad's rank in its Division (1
 * is strongest), and the Division's promotion and relegation places. A top
 * tier has no promotion places, and a bottom tier no relegation places.
 */
export const getBoardObjective = ({
	strengthRank,
	numClubs,
	topTier,
	numAutoPromoted,
	numPromotionPlayoffTeams,
	numRelegated,
}: {
	strengthRank: number;
	numClubs: number;
	topTier: boolean;
	numAutoPromoted: number;
	numPromotionPlayoffTeams: number;
	numRelegated: number;
}): BoardObjective => {
	// Tables are closer than squads, so the board allows some slack
	const slack = Math.max(1, Math.round(numClubs / 8));
	const targetPosition = Math.min(numClubs, strengthRank + slack);
	const lastSafePosition = numClubs - numRelegated;

	if (topTier && targetPosition <= slack + 1) {
		return { kind: "title", targetPosition };
	}
	if (!topTier && targetPosition <= numAutoPromoted) {
		return { kind: "promotion", targetPosition };
	}
	if (
		!topTier &&
		targetPosition <= numAutoPromoted + numPromotionPlayoffTeams
	) {
		return { kind: "promotionPlayoff", targetPosition };
	}
	if (targetPosition > lastSafePosition) {
		return { kind: "avoidRelegation", targetPosition: lastSafePosition };
	}
	if (targetPosition <= Math.ceil(numClubs / 2)) {
		return { kind: "topHalf", targetPosition };
	}
	return { kind: "midTable", targetPosition };
};

/**
 * How a finished season changes the owner's mood in a World, in place of
 * ZenGM's regular season (`wins`) and playoff (`playoffs`) success. Meeting the
 * objective is worth a little, and each quarter of the table above or below the
 * target is worth 0.2 more or less, on the same scale as ZenGM's regular season
 * success. Winning the title or promotion is worth as much as a championship,
 * and relegation costs as much as missing the playoffs.
 */
export const getBoardObjectiveMoodDeltas = ({
	targetPosition,
	position,
	numClubs,
	outcome,
}: {
	targetPosition: number;
	position: number;
	numClubs: number;
	outcome: "champion" | "promoted" | "relegated" | undefined;
}) => {
	const quarters = (targetPosition - position) / Math.max(1, numClubs / 4);
	const metBonus = position <= targetPosition ? 0.05 : -0.05;

	return {
		wins: Math.min(0.25, Math.max(-0.3, metBonus + 0.2 * quarters)),
		playoffs: outcome === "relegated" ? -0.2 : outcome === undefined ? 0 : 0.2,
	};
};
