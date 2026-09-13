import type { LocalStateUI } from "../../common/types.ts";

/**
 * International Soccer Zen GM mod (Epic 6): whether the league open in the UI is
 * a World, a league with more than one Division
 */
export const isWorld = (
	competitionDivisions: LocalStateUI["competitionDivisions"],
) => (competitionDivisions?.length ?? 0) > 1;
