import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { getClubHonours } from "./clubHonours.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * International Soccer Zen GM mod (storytelling): a World club's honours and
 * every season it has finished, with Division names, for its history page.
 * Undefined outside a World.
 */
export const getClubHonoursInfo = async (tid: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const t = await idb.cache.teams.get(tid);
	if (!t) {
		return;
	}

	const divisionName = (divisionId: number | undefined) =>
		structure.competitionDivisions.find(
			(division) => division.divisionId === divisionId,
		)?.name ?? "";
	const teamInfoCache = g.get("teamInfoCache");
	const honours = getClubHonours(t.worldHistory ?? []);
	const recordSigning = t.worldRecordSigning;

	return {
		...honours,
		titles: honours.titles.map((row) => ({
			...row,
			divisionName: divisionName(row.divisionId),
		})),
		seasonsByTier: honours.seasonsByTier.map((row) => ({
			...row,
			divisionName: divisionName(row.divisionId),
		})),
		bestFinish: honours.bestFinish
			? {
					...honours.bestFinish,
					divisionName: divisionName(honours.bestFinish.divisionId),
				}
			: undefined,
		recordSigning: recordSigning
			? {
					...recordSigning,
					sellerAbbrev: teamInfoCache[recordSigning.sellerTid]?.abbrev,
					sellerRegion: teamInfoCache[recordSigning.sellerTid]?.region,
				}
			: undefined,
		seasons: (t.worldHistory ?? []).map((entry) => ({
			...entry,
			divisionName: divisionName(entry.divisionId),
		})),
	};
};

/**
 * International Soccer Zen GM mod (storytelling): every World club's honours in
 * short, for the Team Records page, counting only seasons that pass
 * `includeSeason` (like the seasons the user ran the club). Undefined outside a
 * World.
 */
export const getClubRecordsHonours = async (
	includeSeason: (tid: number, season: number) => boolean,
) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const summaries = new Map<
		number,
		{
			topTierSeasons: number;
			titles: number;
			lastTitle: number | undefined;
			lowerTitles: number;
			promotions: number;
			relegations: number;
			bestFinish: { tier: number; position: number } | undefined;
		}
	>();
	for (const t of await idb.cache.teams.getAll()) {
		const honours = getClubHonours(
			(t.worldHistory ?? []).filter((entry) =>
				includeSeason(t.tid, entry.season),
			),
		);
		const topTitles = honours.titles.find((row) => row.tier === 1);
		summaries.set(t.tid, {
			topTierSeasons:
				honours.seasonsByTier.find((row) => row.tier === 1)?.seasons ?? 0,
			titles: topTitles?.seasons.length ?? 0,
			lastTitle: topTitles?.seasons.at(-1),
			lowerTitles: honours.titles
				.filter((row) => row.tier !== 1)
				.reduce((sum, row) => sum + row.seasons.length, 0),
			promotions: honours.promotions.length,
			relegations: honours.relegations.length,
			bestFinish: honours.bestFinish
				? {
						tier: honours.bestFinish.tier,
						position: honours.bestFinish.position,
					}
				: undefined,
		});
	}
	return summaries;
};
