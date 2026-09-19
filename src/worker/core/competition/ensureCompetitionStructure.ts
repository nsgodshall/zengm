import fastDeepEqual from "fast-deep-equal";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { league } from "../index.ts";
import {
	getWorldAwards,
	getWorldAwardsBeforeSoccerStyle,
} from "./worldAwards.ts";
import {
	generateCrestSvg,
	getCrestDataUrl,
	pickCrestPattern,
} from "./crests.ts";
import {
	getStadiumCapacity,
	WORLD_MAX_ROSTER_SIZE,
	WORLD_MIN_ROSTER_SIZE,
} from "./worldSettings.ts";
import {
	type CompetitionStructure,
	getDefaultCompetitionStructure,
	getDivisionIdForNewClub,
	getWorldSeasonLength,
	isSingleDivision,
} from "./competitionStructure.ts";
import { fillWorldSeasonRecords } from "./recordWorldSeason.ts";
import { fillWorldTransferRecords } from "./recordTransfer.ts";
import { ensureClubStature, fillRealClubHistory } from "./newWorld.ts";
import { fillWorldStories } from "./recordWorldStories.ts";

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

	// International Soccer Zen GM mod: a World made before the All-Star game was
	// dropped still plays one. Turn it off once, so it stays off unless the user
	// turns it back on in the settings.
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldAllStarGameOff?: true }).worldAllStarGameOff
	) {
		await idb.cache.gameAttributes.put({ key: "allStarGame", value: null });
		await idb.cache.gameAttributes.put({
			key: "worldAllStarGameOff",
			value: true,
		});
		g.setWithoutSavingToDB("allStarGame", null);
		g.setWithoutSavingToDB("worldAllStarGameOff", true);
	}

	// International Soccer Zen GM mod (Epic 6): a World made before its awards
	// were soccer-style still has ZenGM's awards, or its earlier World awards.
	// Switch them once, unless the user has changed the award settings.
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldSoccerAwards?: true }).worldSoccerAwards
	) {
		const awards = g.get("awards");
		if (
			fastDeepEqual(awards, defaultGameAttributes.awards) ||
			fastDeepEqual(awards, getWorldAwardsBeforeSoccerStyle())
		) {
			const worldAwards = getWorldAwards();
			await idb.cache.gameAttributes.put({
				key: "awards",
				value: worldAwards,
			});
			g.setWithoutSavingToDB("awards", worldAwards);
		}
		await idb.cache.gameAttributes.put({
			key: "worldSoccerAwards",
			value: true,
		});
		g.setWithoutSavingToDB("worldSoccerAwards", true);
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

	// International Soccer Zen GM mod (Epic 8): older Worlds inherited
	// basketball's 10-player minimum. Raise only the untouched default; preserve
	// any value the user deliberately configured.
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldMinimumRosterSet?: true }).worldMinimumRosterSet
	) {
		if (g.get("minRosterSize") === defaultGameAttributes.minRosterSize) {
			await league.setGameAttributes({ minRosterSize: WORLD_MIN_ROSTER_SIZE });
		}
		await league.setGameAttributes({ worldMinimumRosterSet: true });
	}

	// International Soccer Zen GM mod (Epic 8): a World made before crests,
	// bigger rosters, and stadiums by market gets them once, where it still has
	// ZenGM's defaults
	if (
		!isSingleDivision(structure) &&
		!(g as unknown as { worldContentFilled?: true }).worldContentFilled
	) {
		if (g.get("maxRosterSize") === defaultGameAttributes.maxRosterSize) {
			await league.setGameAttributes({ maxRosterSize: WORLD_MAX_ROSTER_SIZE });
		}

		const season = g.get("season");
		let logosChanged = false;
		for (const t of await idb.cache.teams.getAll()) {
			const teamSeason = await idb.cache.teamSeasons.indexGet(
				"teamSeasonsBySeasonTid",
				[season, t.tid],
			);
			let changed = false;
			if (!t.imgURL) {
				t.imgURL = getCrestDataUrl(
					generateCrestSvg({
						abbrev: t.abbrev,
						colors: t.colors,
						pattern: pickCrestPattern(),
					}),
				);
				changed = true;
				logosChanged = true;
			}
			if (teamSeason && t.stadiumCapacity === g.get("defaultStadiumCapacity")) {
				t.stadiumCapacity = getStadiumCapacity(teamSeason.pop);
				changed = true;
			}
			if (changed) {
				await idb.cache.teams.put(t);
				if (teamSeason) {
					teamSeason.imgURL = t.imgURL;
					teamSeason.stadiumCapacity = t.stadiumCapacity;
					await idb.cache.teamSeasons.put(teamSeason);
				}
			}
		}

		if (logosChanged) {
			const teams = await idb.cache.teams.getAll();
			await league.setGameAttributes({
				teamInfoCache: g.get("teamInfoCache").map((info, tid) => ({
					...info,
					imgURL: teams.find((t) => t.tid === tid)?.imgURL ?? info.imgURL,
				})),
			});
		}

		await idb.cache.gameAttributes.put({
			key: "worldContentFilled",
			value: true,
		});
		g.setWithoutSavingToDB("worldContentFilled", true);
	}

	// International Soccer Zen GM mod (storytelling): a World made before season
	// records and record fees gets them once
	if (!isSingleDivision(structure)) {
		await fillWorldSeasonRecords();
		await fillWorldTransferRecords();
		await fillRealClubHistory();
		await ensureClubStature();
		await fillWorldStories();
	}
};

export default ensureCompetitionStructure;
