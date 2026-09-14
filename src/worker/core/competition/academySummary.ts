import { getAcademyPlayers, summarizeAcademyPlayers } from "./academies.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * International Soccer Zen GM mod (Epic 6): a club's academy at a glance, for
 * its team page: how many players it has and its best prospect (see
 * summarizeAcademyPlayers). Undefined outside a World.
 */
export const getAcademySummary = async (tid: number) => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	return summarizeAcademyPlayers(await getAcademyPlayers(tid));
};
