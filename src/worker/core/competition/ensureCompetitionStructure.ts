import fastDeepEqual from "fast-deep-equal";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { league } from "../index.ts";
import { getWorldAwards } from "./worldAwards.ts";
import {
	type CompetitionStructure,
	getDefaultCompetitionStructure,
	getDivisionIdForNewClub,
	getWorldSeasonLength,
	isSingleDivision,
} from "./competitionStructure.ts";

/**
 * The current league's competition structure. Once a league is loaded this is
 * always what's saved (see ensureCompetitionStructure below), but the keys are
 * optional in GameAttributesLeague until the divisionId cutover and g.get
 * throws on unset keys, so fall back to the default structure.
 */
export const getCompetitionStructure = (): CompetitionStructure => {
	const { countries, competitionDivisions, promotionRelegationLinks } =
		g as unknown as Partial<CompetitionStructure>;

	if (!countries || !competitionDivisions) {
		return getDefaultCompetitionStructure();
	}

	return {
		countries,
		competitionDivisions,
		promotionRelegationLinks: promotionRelegationLinks ?? [],
	};
};

/**
 * Runs on every league load. Saves from upstream ZenGM, or from before Epic 1,
 * have no competition structure and no divisionIds. Rather than bumping
 * LEAGUE_DATABASE_VERSION — which would collide with upstream's next database
 * migration every time we merge — fill them in here, the same way
 * loadGameAttributes already fills in missing settings:
 *
 * - No structure saved: save the default single-Division structure.
 * - Any team without a divisionId gets one (see getDivisionIdForNewClub).
 * - So does any team season in the cache (the last few seasons). Older team
 *   seasons in the database are left alone: a missing divisionId there means
 *   the league predates its competition structure, so the club was in the
 *   default Division.
 *
 * Does nothing once everything is filled in.
 */
const ensureCompetitionStructure = async () => {
	const saved = g as unknown as Partial<CompetitionStructure>;
	if (!saved.countries || !saved.competitionDivisions) {
		const structure = getDefaultCompetitionStructure();

		await idb.cache.gameAttributes.put({
			key: "countries",
			value: structure.countries,
		});
		await idb.cache.gameAttributes.put({
			key: "competitionDivisions",
			value: structure.competitionDivisions,
		});
		await idb.cache.gameAttributes.put({
			key: "promotionRelegationLinks",
			value: structure.promotionRelegationLinks,
		});

		g.setWithoutSavingToDB("countries", structure.countries);
		g.setWithoutSavingToDB(
			"competitionDivisions",
			structure.competitionDivisions,
		);
		g.setWithoutSavingToDB(
			"promotionRelegationLinks",
			structure.promotionRelegationLinks,
		);
	}

	const structure = getCompetitionStructure();

	for (const t of await idb.cache.teams.getAll()) {
		if (t.divisionId === undefined) {
			t.divisionId = getDivisionIdForNewClub(structure, t);
			await idb.cache.teams.put(t);
		}
	}

	// Use each season's own did rather than the team's current Division, since
	// in a multi-Division World the club may have moved since
	for (const teamSeason of await idb.cache.teamSeasons.getAll()) {
		if (teamSeason.divisionId === undefined) {
			teamSeason.divisionId = getDivisionIdForNewClub(structure, teamSeason);
			await idb.cache.teamSeasons.put(teamSeason);
		}
	}

	// International Soccer Zen GM mod (Epic 4): a World made before wage budgets
	// became the only payroll limit still has ZenGM's minimum payroll fine and
	// luxury tax. Turn them off once, so they stay off unless the user turns them
	// back on in the settings.
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldPayrollRulesOff?: true }).worldPayrollRulesOff
	) {
		await idb.cache.gameAttributes.put({ key: "luxuryTax", value: 0 });
		await idb.cache.gameAttributes.put({ key: "minPayroll", value: 0 });
		await idb.cache.gameAttributes.put({
			key: "worldPayrollRulesOff",
			value: true,
		});
		g.setWithoutSavingToDB("luxuryTax", 0);
		g.setWithoutSavingToDB("minPayroll", 0);
		g.setWithoutSavingToDB("worldPayrollRulesOff", true);
	}

	// International Soccer Zen GM mod (Epic 6): a World made before awards were
	// per Division still has ZenGM's awards. Switch them once, unless the user
	// has changed the award settings.
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldAwardsPerDivision?: true }).worldAwardsPerDivision
	) {
		if (fastDeepEqual(g.get("awards"), defaultGameAttributes.awards)) {
			const awards = getWorldAwards(g.get("awards"));
			await idb.cache.gameAttributes.put({ key: "awards", value: awards });
			g.setWithoutSavingToDB("awards", awards);
		}
		await idb.cache.gameAttributes.put({
			key: "worldAwardsPerDivision",
			value: true,
		});
		g.setWithoutSavingToDB("worldAwardsPerDivision", true);
	}

	// International Soccer Zen GM mod (Epic 8): a World made before its
	// league-wide season length matched its Divisions' own paid salaries and
	// earned revenue per game as if seasons were 82 games. Match them, from next
	// season if this one has started.
	const seasonLength = getWorldSeasonLength(structure);
	if (
		!isSingleDivision(structure) &&
		seasonLength !== undefined &&
		g.get("numGames", g.get("season") + 1) !== seasonLength
	) {
		await league.setGameAttributes({ numGames: seasonLength });
	}
};

export default ensureCompetitionStructure;
