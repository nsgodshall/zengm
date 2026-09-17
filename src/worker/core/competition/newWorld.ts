import type { GameAttributesLeague } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { ensureAcademies } from "./academies.ts";
import { getNextOwner } from "./clubOwners.ts";
import {
	describeClubStature,
	getLegacyForStature,
	getStartingLegacy,
	getStature,
} from "./clubStature.ts";
import {
	applyRealClubIdentity,
	getRealClubHistory,
} from "./realClubHistory.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { recordStartingPayrolls } from "./wageBudgets.ts";

// Storytelling: a real club starts with its real stature, founding year, and
// nickname (see competition/realClubHistory.ts), and any other club with the
// legacy of a club that has always been on its starting tier (see
// competition/clubStature.ts)
const seedClubStature = async () => {
	const structure = getCompetitionStructure();
	const season = g.get("season");
	for (const t of await idb.cache.teams.getAll()) {
		const tier = structure.competitionDivisions.find(
			(division) => division.divisionId === t.divisionId,
		)?.tier;
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[t.tid, season],
		);
		if (tier === undefined || !teamSeason) {
			continue;
		}

		const real = getRealClubHistory(t);
		t.worldStatureSeed = {
			legacy: real
				? getLegacyForStature({ stature: real.stature, pop: teamSeason.pop })
				: getStartingLegacy(tier),
			season,
		};
		t.worldStature = getStature({
			legacy: t.worldStatureSeed.legacy,
			pop: teamSeason.pop,
		});
		// Storytelling (Phase 6c): every club starts with an owner
		t.worldOwner = getNextOwner({
			owner: undefined,
			season,
			revenue: 0,
			takeover: false,
			random: Math.random,
		}).owner;
		if (real) {
			applyRealClubIdentity(t, real);
		}
		await idb.cache.teams.put(t);
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

/**
 * International Soccer Zen GM mod (storytelling): a World made before real
 * clubs' history was added gives its real clubs their founding years and
 * nicknames, and their real starting stature if they have no stature seed yet,
 * once, when it loads
 */
export const fillRealClubHistory = async () => {
	if (
		isSingleDivision(getCompetitionStructure()) ||
		(g as unknown as Partial<GameAttributesLeague>).worldRealClubHistoryFilled
	) {
		return;
	}

	for (const t of await idb.cache.teams.getAll()) {
		const real = getRealClubHistory(t);
		if (!real) {
			continue;
		}
		if (!t.worldIdentity) {
			applyRealClubIdentity(t, real);
		}
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[t.tid, g.get("season")],
		);
		if (!t.worldStatureSeed && teamSeason) {
			const firstSeason = t.worldHistory?.[0]?.season ?? g.get("season");
			t.worldStatureSeed = {
				legacy: getLegacyForStature({
					stature: real.stature,
					pop: teamSeason.pop,
				}),
				season: firstSeason,
			};
		}
		await idb.cache.teams.put(t);
	}

	await idb.cache.gameAttributes.put({
		key: "worldRealClubHistoryFilled",
		value: true,
	});
	g.setWithoutSavingToDB("worldRealClubHistoryFilled", true);
};

/**
 * International Soccer Zen GM mod (storytelling): a World club without a saved
 * stature (from a World made before stature affected play) gets one from its
 * history when the World loads
 */
export const ensureClubStature = async () => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	for (const t of await idb.cache.teams.getAll()) {
		if (t.disabled) {
			continue;
		}
		// Storytelling (Phase 6c): a World from before owners gets them
		if (!t.worldOwner) {
			t.worldOwner = getNextOwner({
				owner: undefined,
				season: g.get("season"),
				revenue: 0,
				takeover: false,
				random: Math.random,
			}).owner;
			await idb.cache.teams.put(t);
		}
		if (t.worldStature !== undefined) {
			continue;
		}
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[t.tid, g.get("season")],
		);
		const tier = structure.competitionDivisions.find(
			(division) => division.divisionId === t.divisionId,
		)?.tier;
		if (!teamSeason || tier === undefined) {
			continue;
		}
		// The stature saved with its latest season, or worked out from its history
		t.worldStature =
			t.worldHistory?.at(-1)?.stature ??
			describeClubStature({
				seed: t.worldStatureSeed,
				history: t.worldHistory ?? [],
				tier,
				pop: teamSeason.pop,
				season: g.get("season"),
			}).stature;
		await idb.cache.teams.put(t);
	}
};
