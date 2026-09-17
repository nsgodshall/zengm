import type { WorldHistoryEntry } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	type CompetitionStructure,
	isSingleDivision,
} from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

// International Soccer Zen GM mod (storytelling): each Country's roll of honour,
// season by season, for a World's League History page, from its clubs' saved
// histories

type Place = { tid: number; count: number };

export const buildWorldRollOfHonour = ({
	structure,
	clubs,
}: {
	structure: CompetitionStructure;
	clubs: { tid: number; history: WorldHistoryEntry[] }[];
}) =>
	structure.countries.map((country) => {
		const divisions = structure.competitionDivisions
			.filter((division) => division.countryId === country.countryId)
			.sort((a, b) => a.tier - b.tier);
		const divisionIds = new Set(
			divisions.map((division) => division.divisionId),
		);
		const topTier = divisions[0]?.tier ?? 1;

		const entries = clubs
			.flatMap((club) =>
				club.history.map((entry) => ({ tid: club.tid, entry })),
			)
			.filter(({ entry }) => divisionIds.has(entry.divisionId));
		const seasons = [...new Set(entries.map(({ entry }) => entry.season))].sort(
			(a, b) => a - b,
		);

		const championCounts = new Map<string, number>();
		const runnerUpCounts = new Map<number, number>();
		const count = (counts: Map<string, number>, key: string) => {
			const value = (counts.get(key) ?? 0) + 1;
			counts.set(key, value);
			return value;
		};

		const rows = seasons.map((season) => {
			const seasonEntries = entries.filter(
				({ entry }) => entry.season === season,
			);
			const champions = divisions.map((division): Place | undefined => {
				const champion = seasonEntries.find(
					({ entry }) =>
						entry.divisionId === division.divisionId && entry.champion,
				);
				return champion
					? {
							tid: champion.tid,
							count: count(
								championCounts,
								`${division.divisionId} ${champion.tid}`,
							),
						}
					: undefined;
			});

			const runnerUpEntry = seasonEntries.find(
				({ entry }) => entry.tier === topTier && entry.position === 2,
			);
			let runnerUp: Place | undefined;
			if (runnerUpEntry) {
				const value = (runnerUpCounts.get(runnerUpEntry.tid) ?? 0) + 1;
				runnerUpCounts.set(runnerUpEntry.tid, value);
				runnerUp = { tid: runnerUpEntry.tid, count: value };
			}

			return {
				season,
				champions,
				runnerUp,
				promotedToTop: seasonEntries
					.filter(
						({ entry }) =>
							entry.tier === topTier + 1 && entry.moved === "promoted",
					)
					.map(({ tid, entry }) => ({
						tid,
						viaPlayoff: entry.promotionPlayoff === "won",
					})),
				relegatedFromTop: seasonEntries
					.filter(
						({ entry }) =>
							entry.tier === topTier && entry.moved === "relegated",
					)
					.map(({ tid }) => tid),
			};
		});

		return {
			countryId: country.countryId,
			name: country.name,
			divisions: divisions.map((division) => ({
				divisionId: division.divisionId,
				name: division.name,
				tier: division.tier,
			})),
			seasons: rows.reverse(),
		};
	});

/**
 * International Soccer Zen GM mod (storytelling): a World's roll of honour with
 * club names and logos. Undefined outside a World.
 */
export const getWorldRollOfHonour = async () => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teams = await idb.cache.teams.getAll();
	const teamInfoCache = g.get("teamInfoCache");
	const club = (tid: number) => ({
		tid,
		abbrev: teamInfoCache[tid]?.abbrev ?? "???",
		region: teamInfoCache[tid]?.region ?? "",
		name: teamInfoCache[tid]?.name ?? "",
		imgURL: teamInfoCache[tid]?.imgURL,
		imgURLSmall: teamInfoCache[tid]?.imgURLSmall,
	});

	return buildWorldRollOfHonour({
		structure,
		clubs: teams.map((t) => ({ tid: t.tid, history: t.worldHistory ?? [] })),
	}).map((country) => ({
		...country,
		seasons: country.seasons.map((row) => ({
			season: row.season,
			champions: row.champions.map((place) =>
				place ? { ...club(place.tid), count: place.count } : undefined,
			),
			runnerUp: row.runnerUp
				? { ...club(row.runnerUp.tid), count: row.runnerUp.count }
				: undefined,
			promotedToTop: row.promotedToTop.map((place) => ({
				...club(place.tid),
				viaPlayoff: place.viaPlayoff,
			})),
			relegatedFromTop: row.relegatedFromTop.map(club),
		})),
	}));
};
