import type { WorldHistoryEntry } from "../../../common/types.ts";
import { getLongestTitleRun } from "./storyContext.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): what to watch in each Country before a World season starts, for the
// Season Preview: the champions defending their title (and chasing records),
// the promoted clubs and what their promotion means, big clubs stuck below the
// top tier, the strongest squads, and derbies in the same Division.

export const SEASON_STORYLINE_SETTINGS = {
	// A club this big or bigger outside the top tier is a sleeping giant
	sleepingGiantStature: 60,
	// Promotion back to a tier after this many seasons away is a long wait
	longWait: 10,
	// The strongest squads named in each top tier
	numFavourites: 3,
};

export type StorylineKind =
	| "defendingChampion"
	| "promoted"
	| "sleepingGiant"
	| "favourites"
	| "derby";

export type Storyline = {
	kind: StorylineKind;
	tids: number[];
	facts: Record<string, number | string>;
};

export type StorylineClub = {
	tid: number;
	countryId: number;
	town?: string;
	// This season's Division and tier
	divisionId: number;
	tier: number;
	stature: number;
	// Squad strength going into the season
	ovr: number;
	// Finished seasons, before this one
	history: WorldHistoryEntry[];
};

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth"];

/** A Country's storylines for `season`, in the order to tell them */
export const getSeasonStorylines = ({
	season,
	countryId,
	divisions,
	clubs: allClubs,
}: {
	season: number;
	countryId: number;
	divisions: {
		divisionId: number;
		countryId: number;
		tier: number;
		name: string;
	}[];
	clubs: StorylineClub[];
}): Storyline[] => {
	const settings = SEASON_STORYLINE_SETTINGS;
	const clubs = allClubs.filter((club) => club.countryId === countryId);
	const countryDivisions = divisions
		.filter((division) => division.countryId === countryId)
		.sort((a, b) => a.tier - b.tier);
	const topDivision = countryDivisions[0];
	if (!topDivision) {
		return [];
	}
	const topTier = topDivision.tier;
	const divisionName = (divisionId: number) =>
		divisions.find((division) => division.divisionId === divisionId)?.name ??
		"";
	const storylines: Storyline[] = [];
	const last = (club: StorylineClub) =>
		club.history.find((entry) => entry.season === season - 1);

	// The champions defend their title
	const champion = clubs.find((club) => {
		const entry = last(club);
		return entry?.champion && entry.tier === topTier;
	});
	if (champion) {
		let titlesInRow = 0;
		for (
			let entry = last(champion);
			entry?.champion && entry.tier === topTier;
			entry = champion.history.find(
				(other) => other.season === entry!.season - 1,
			)
		) {
			titlesInRow += 1;
		}
		const record = getLongestTitleRun(
			clubs.map((club) => club.history),
			topTier,
		);
		storylines.push({
			kind: "defendingChampion",
			tids: [champion.tid],
			facts: {
				titlesInRow,
				record: titlesInRow >= 2 && titlesInRow === record ? 1 : 0,
				division: topDivision.name,
			},
		});
	}

	// The strongest squads in the top tier
	const favourites = clubs
		.filter((club) => club.tier === topTier)
		.sort((a, b) => b.ovr - a.ovr || a.tid - b.tid)
		.slice(0, settings.numFavourites);
	if (favourites.length > 0) {
		storylines.push({
			kind: "favourites",
			tids: favourites.map((club) => club.tid),
			facts: { division: topDivision.name },
		});
	}

	// Clubs promoted to the top tier, and what their promotion means
	for (const club of clubs) {
		const entry = last(club);
		if (
			club.tier !== topTier ||
			!entry ||
			entry.moved !== "promoted" ||
			entry.tier !== topTier + 1
		) {
			continue;
		}
		const before = club.history.filter((other) => other.season < season - 1);
		const lastTop = before.findLast((other) => other.tier === topTier);
		const facts: Storyline["facts"] = { division: topDivision.name };
		if (lastTop?.season === season - 2) {
			facts.bounceBack = 1;
		} else if (lastTop) {
			facts.seasonsAway = season - 1 - lastTop.season;
		} else if (before.length + 1 >= settings.longWait) {
			facts.firstTimeIn = before.length + 1;
		}
		storylines.push({ kind: "promoted", tids: [club.tid], facts });
	}

	// Big clubs outside the top tier
	for (const club of clubs
		.filter(
			(club) =>
				club.tier > topTier && club.stature >= settings.sleepingGiantStature,
		)
		.sort((a, b) => b.stature - a.stature)) {
		storylines.push({
			kind: "sleepingGiant",
			tids: [club.tid],
			facts: {
				division: divisionName(club.divisionId),
				relegatedLastSeason: last(club)?.moved === "relegated" ? 1 : 0,
			},
		});
	}

	// Derbies in the same Division this season
	for (const [i, a] of clubs.entries()) {
		for (const b of clubs.slice(i + 1)) {
			if (
				a.town === undefined ||
				a.town !== b.town ||
				a.divisionId !== b.divisionId
			) {
				continue;
			}
			const lastA = last(a);
			const lastB = last(b);
			storylines.push({
				kind: "derby",
				tids: [a.tid, b.tid],
				facts: {
					town: a.town,
					division: divisionName(a.divisionId),
					back: lastA && lastB && lastA.divisionId !== lastB.divisionId ? 1 : 0,
				},
			});
		}
	}

	return storylines;
};

/** A storyline in words, with `club` naming a club */
export const writeStoryline = (
	storyline: Storyline,
	club: (tid: number) => string,
) => {
	const { facts, tids } = storyline;
	const main = club(tids[0]!);
	switch (storyline.kind) {
		case "defendingChampion": {
			const next = (facts.titlesInRow as number) + 1;
			const nth = ORDINALS[next] ?? `${next}th`;
			if (facts.titlesInRow === 1) {
				return `${main} defend their ${facts.division} title.`;
			}
			return facts.record
				? `${main} go for a record ${nth} ${facts.division} title in a row.`
				: `${main} go for a ${nth} ${facts.division} title in a row.`;
		}
		case "favourites":
			return `The strongest squads in the ${facts.division}: ${tids.map(club).join(", ")}.`;
		case "promoted":
			if (facts.bounceBack) {
				return `${main} are back in the ${facts.division} at the first attempt.`;
			}
			if (facts.seasonsAway !== undefined) {
				return `${main} are back in the ${facts.division} after ${facts.seasonsAway} seasons away.`;
			}
			if (facts.firstTimeIn !== undefined) {
				return `${main} reach the ${facts.division} for the first time in ${facts.firstTimeIn} seasons.`;
			}
			return `${main} are promoted to the ${facts.division}.`;
		case "sleepingGiant":
			return facts.relegatedLastSeason
				? `${main} start life in the ${facts.division} after relegation.`
				: `${main} try to escape the ${facts.division}.`;
		case "derby":
			return facts.back
				? `The ${facts.town} derby is back in the ${facts.division}: ${main} and ${club(tids[1]!)}.`
				: `The ${facts.town} derby in the ${facts.division}: ${main} and ${club(tids[1]!)}.`;
	}
};
