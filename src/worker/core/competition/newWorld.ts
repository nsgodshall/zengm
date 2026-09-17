import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { ensureAcademies } from "./academies.ts";
import { getStartingLegacy } from "./clubStature.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { recordStartingPayrolls } from "./wageBudgets.ts";

// Storytelling: every club starts with the legacy of a club that has always
// been on its starting tier (see competition/clubStature.ts)
const seedClubStature = async () => {
	const structure = getCompetitionStructure();
	for (const t of await idb.cache.teams.getAll()) {
		const tier = structure.competitionDivisions.find(
			(division) => division.divisionId === t.divisionId,
		)?.tier;
		if (tier !== undefined) {
			t.worldStatureSeed = {
				legacy: getStartingLegacy(tier),
				season: g.get("season"),
			};
			await idb.cache.teams.put(t);
		}
	}
};

/**
 * International Soccer Zen GM mod (Epic 7): once a new World's clubs and
 * players exist, record each club's starting payroll for its first wage budget
 * (see getWageBudget), fill its youth academies, and seed each club's stature.
 * Does nothing outside a World.
 */
const setUpNewWorld = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	await recordStartingPayrolls();
	await ensureAcademies();
	await seedClubStature();
};

export default setUpNewWorld;
