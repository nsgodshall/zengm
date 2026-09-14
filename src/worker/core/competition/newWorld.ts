import { ensureAcademies } from "./academies.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { recordStartingPayrolls } from "./wageBudgets.ts";

/**
 * International Soccer Zen GM mod (Epic 7): once a new World's clubs and
 * players exist, record each club's starting payroll for its first wage budget
 * (see getWageBudget) and fill its youth academies. Does nothing outside a
 * World.
 */
const setUpNewWorld = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	await recordStartingPayrolls();
	await ensureAcademies();
};

export default setUpNewWorld;
