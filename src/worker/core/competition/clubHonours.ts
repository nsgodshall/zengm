import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling): a World club's roll of honour,
// from its saved history (see STORY_TELLING_PLAN.md, Phase 2). Only what
// happened in the World counts.

export const DYNASTY_SETTINGS = {
	// A dynasty is this many titles within this many seasons
	titles: 3,
	seasons: 5,
};

export type Dynasty = { from: number; to: number; titles: number };

/**
 * The dynasties in a club's title seasons: each run of DYNASTY_SETTINGS.titles
 * titles within DYNASTY_SETTINGS.seasons seasons, with overlapping runs joined
 * into one, from its first title to its last
 */
export const getDynasties = (titleSeasons: number[]): Dynasty[] => {
	const seasons = [...titleSeasons].sort((a, b) => a - b);
	const spans: { from: number; to: number }[] = [];
	for (let i = 0; i + DYNASTY_SETTINGS.titles <= seasons.length; i++) {
		const from = seasons[i]!;
		const to = seasons[i + DYNASTY_SETTINGS.titles - 1]!;
		if (to - from >= DYNASTY_SETTINGS.seasons) {
			continue;
		}
		const last = spans.at(-1);
		if (last && from <= last.to) {
			last.to = to;
		} else {
			spans.push({ from, to });
		}
	}
	return spans.map((span) => ({
		...span,
		titles: seasons.filter((season) => season >= span.from && season <= span.to)
			.length,
	}));
};

// The longest run of consecutive seasons passing `test`, and the run going on
// in the latest season
const getRuns = (
	history: WorldHistoryEntry[],
	test: (entry: WorldHistoryEntry) => boolean,
) => {
	let current = 0;
	let longest = 0;
	for (const [i, entry] of history.entries()) {
		const previous = history[i - 1];
		if (!test(entry)) {
			current = 0;
		} else if (
			previous &&
			previous.season === entry.season - 1 &&
			current > 0
		) {
			current += 1;
		} else {
			current = 1;
		}
		longest = Math.max(longest, current);
	}
	return { current, longest };
};

export const getClubHonours = (fullHistory: WorldHistoryEntry[]) => {
	const history = [...fullHistory].sort((a, b) => a.season - b.season);
	const tiers = [...new Set(history.map((entry) => entry.tier))].sort(
		(a, b) => a - b,
	);

	const titles = tiers
		.map((tier) => {
			const entries = history.filter(
				(entry) => entry.tier === tier && entry.champion,
			);
			return {
				tier,
				divisionId: entries.at(-1)?.divisionId,
				seasons: entries.map((entry) => entry.season),
			};
		})
		.filter((row) => row.seasons.length > 0);

	const best = history.reduce<WorldHistoryEntry | undefined>(
		(best, entry) =>
			!best ||
			entry.tier < best.tier ||
			(entry.tier === best.tier && entry.position < best.position)
				? entry
				: best,
		undefined,
	);

	return {
		numSeasons: history.length,
		titles,
		dynasties: getDynasties(
			history
				.filter((entry) => entry.champion && entry.tier === 1)
				.map((entry) => entry.season),
		),
		promotions: history
			.filter((entry) => entry.moved === "promoted")
			.map((entry) => ({
				season: entry.season,
				viaPlayoff: entry.promotionPlayoff === "won",
			})),
		relegations: history
			.filter((entry) => entry.moved === "relegated")
			.map((entry) => entry.season),
		promotionPlayoffs: {
			won: history.filter((entry) => entry.promotionPlayoff === "won").length,
			lost: history.filter((entry) => entry.promotionPlayoff === "lost").length,
		},
		seasonsByTier: tiers.map((tier) => {
			const entries = history.filter((entry) => entry.tier === tier);
			return {
				tier,
				divisionId: entries.at(-1)!.divisionId,
				seasons: entries.length,
			};
		}),
		bestFinish: best
			? {
					tier: best.tier,
					divisionId: best.divisionId,
					position: best.position,
					seasons: history
						.filter(
							(entry) =>
								entry.tier === best.tier && entry.position === best.position,
						)
						.map((entry) => entry.season),
				}
			: undefined,
		topTierRun: getRuns(history, (entry) => entry.tier === 1),
		neverRelegated:
			history.length > 0 &&
			!history.some((entry) => entry.moved === "relegated"),
	};
};

export type ClubHonours = ReturnType<typeof getClubHonours>;
