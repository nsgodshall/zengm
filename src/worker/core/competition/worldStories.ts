import type {
	WorldHistoryEntry,
	WorldSeasonRuns,
} from "../../../common/types.ts";
import { getDynasties } from "./clubHonours.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 4): the stories a World's season told that no single news item does, found
// from its clubs' saved histories when the season ends: dynasties beginning and
// ending, challengers breaking the big clubs' grip, fallen giants, climbs up the
// pyramid, yo-yo clubs, records, unbeaten seasons, and close title races. Each
// keeps the facts it was written from, so its wording can change (or a
// language model can write it) without losing what happened.

export type WorldStoryKind =
	| "titleRace"
	| "titleDefended"
	| "promotedChampions"
	| "dynasty"
	| "endOfEra"
	| "challengerTitle"
	| "fallenGiant"
	| "climb"
	| "yoYo"
	| "recordPoints"
	| "fewestPoints"
	| "unbeaten"
	| "winless";

export type WorldStory = {
	kind: WorldStoryKind;
	season: number;
	countryId: number;
	divisionId?: number;
	// The club the story is about first
	tids: number[];
	// How big a story it is, from 0 to 100
	significance: number;
	facts: Record<string, number | string>;
};

export const WORLD_STORY_SETTINGS = {
	// A club this big or bigger (see competition/clubStature.ts) is a giant
	giantStature: 70,
	// The number of biggest clubs whose grip a challenger breaks
	numBigClubs: 3,
	// A title won by this many points or fewer is a close race
	closeRacePoints: 3,
	// Records need this many earlier seasons to beat
	recordMinSeasons: 5,
	// A climb is this many tiers within this many seasons
	climbTiers: 2,
	climbSeasons: 5,
	// A yo-yo club goes up and down this many times each within this many seasons
	yoYoMoves: 3,
	yoYoSeasons: 10,
};

export type WorldStoryClub = {
	tid: number;
	countryId: number;
	// Every finished season, including this one
	history: WorldHistoryEntry[];
	// Its stature going into this season
	statureBefore: number;
	// This season's runs, if they were kept
	runs?: WorldSeasonRuns;
};

type Division = {
	divisionId: number;
	countryId: number;
	tier: number;
	name: string;
};

const entryFor = (club: WorldStoryClub, season: number) =>
	club.history.find((entry) => entry.season === season);

/** Every story a Country's season told, most significant first */
export const detectCountryStories = ({
	season,
	countryId,
	divisions,
	clubs: allClubs,
}: {
	season: number;
	countryId: number;
	divisions: Division[];
	clubs: WorldStoryClub[];
}): WorldStory[] => {
	const settings = WORLD_STORY_SETTINGS;
	const clubs = allClubs.filter((club) => club.countryId === countryId);
	const stories: WorldStory[] = [];
	const divisionName = (divisionId: number) =>
		divisions.find((division) => division.divisionId === divisionId)?.name ??
		"";
	const add = (story: Omit<WorldStory, "season" | "countryId">) => {
		stories.push({ ...story, season, countryId });
	};

	const thisSeason = clubs
		.map((club) => ({ club, entry: entryFor(club, season) }))
		.filter(
			(row): row is { club: WorldStoryClub; entry: WorldHistoryEntry } =>
				row.entry !== undefined,
		);
	const topTier = Math.min(...thisSeason.map(({ entry }) => entry.tier));
	const top = thisSeason
		.filter(({ entry }) => entry.tier === topTier)
		.sort((a, b) => a.entry.position - b.entry.position);
	const champion = top[0];

	if (champion?.entry.champion) {
		const { club, entry } = champion;
		const topDivisionName = divisionName(entry.divisionId);

		// A close title race
		const second = top[1];
		if (second) {
			const margin = entry.points - second.entry.points;
			if (margin <= settings.closeRacePoints) {
				add({
					kind: "titleRace",
					divisionId: entry.divisionId,
					tids: [club.tid, second.club.tid],
					significance: margin === 0 ? 60 : 45,
					facts: { margin, division: topDivisionName },
				});
			}
		}

		// Titles in a row, and champions who were only just promoted
		const previous = club.history.find((e) => e.season === season - 1);
		let titlesInRow = 1;
		for (
			let e = previous;
			e?.champion && e.tier === topTier;
			e = club.history.find((other) => other.season === e!.season - 1)
		) {
			titlesInRow += 1;
		}
		if (titlesInRow >= 2) {
			add({
				kind: "titleDefended",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: Math.min(70, 30 + 10 * (titlesInRow - 2)),
				facts: { titlesInRow, division: topDivisionName },
			});
		} else if (previous && previous.tier > topTier) {
			add({
				kind: "promotedChampions",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: 75,
				facts: { division: topDivisionName },
			});
		}

		// A dynasty begins: a third title in 5 seasons for the first time in this
		// run of titles
		const titleSeasons = club.history
			.filter((e) => e.tier === topTier && e.champion)
			.map((e) => e.season);
		const dynasty = getDynasties(titleSeasons).find(
			(dynasty) => dynasty.to === season,
		);
		if (dynasty && dynasty.titles === 3) {
			add({
				kind: "dynasty",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: 60,
				facts: {
					titles: dynasty.titles,
					seasons: season - dynasty.from + 1,
					division: topDivisionName,
				},
			});
		}

		// A challenger breaks the grip of the top tier's biggest clubs
		const bigClubs = top
			.map((row) => row.club)
			.sort((a, b) => b.statureBefore - a.statureBefore || a.tid - b.tid)
			.slice(0, settings.numBigClubs);
		if (!bigClubs.includes(club)) {
			add({
				kind: "challengerTitle",
				divisionId: entry.divisionId,
				tids: [club.tid, ...bigClubs.map((big) => big.tid)],
				significance: 65,
				facts: {
					stature: Math.round(club.statureBefore),
					division: topDivisionName,
				},
			});
		}

		// Record points, with enough seasons before to mean something
		const earlierTopEntries = clubs.flatMap((other) =>
			other.history.filter((e) => e.season < season && e.tier === topTier),
		);
		const earlierSeasons = new Set(earlierTopEntries.map((e) => e.season));
		if (earlierSeasons.size >= settings.recordMinSeasons) {
			const record = Math.max(...earlierTopEntries.map((e) => e.points));
			if (entry.points > record) {
				add({
					kind: "recordPoints",
					divisionId: entry.divisionId,
					tids: [club.tid],
					significance: 55,
					facts: {
						points: entry.points,
						previousRecord: record,
						division: topDivisionName,
					},
				});
			}

			const last = top.at(-1);
			const fewest = Math.min(...earlierTopEntries.map((e) => e.points));
			if (last && last !== champion && last.entry.points < fewest) {
				add({
					kind: "fewestPoints",
					divisionId: last.entry.divisionId,
					tids: [last.club.tid],
					significance: 35,
					facts: {
						points: last.entry.points,
						previousRecord: fewest,
						division: topDivisionName,
					},
				});
			}
		}
	}

	// The end of an era: two seasons without a title after 3 or more in the 5
	// seasons before
	for (const club of clubs) {
		const titleSeasons = club.history
			.filter((e) => e.tier === topTier && e.champion)
			.map((e) => e.season);
		if (titleSeasons.at(-1) !== season - 2) {
			continue;
		}
		const dynasty = getDynasties(titleSeasons).find(
			(dynasty) => dynasty.to === season - 2,
		);
		if (dynasty) {
			add({
				kind: "endOfEra",
				tids: [club.tid],
				significance: 55,
				facts: {
					titles: dynasty.titles,
					from: dynasty.from,
					to: dynasty.to,
				},
			});
		}
	}

	for (const { club, entry } of thisSeason) {
		const history = [...club.history].sort((a, b) => a.season - b.season);

		// Fallen giants
		if (
			entry.tier === topTier &&
			entry.moved === "relegated" &&
			club.statureBefore >= settings.giantStature
		) {
			add({
				kind: "fallenGiant",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: 70,
				facts: {
					stature: Math.round(club.statureBefore),
					division: divisionName(entry.divisionId),
				},
			});
		}

		// A climb to the top tier from far below
		if (entry.moved === "promoted" && entry.tier === topTier + 1) {
			const start = history.find(
				(e) =>
					e.season >= season - settings.climbSeasons + 1 &&
					e.tier - topTier >= settings.climbTiers,
			);
			if (start) {
				add({
					kind: "climb",
					tids: [club.tid],
					significance: 60,
					facts: {
						fromTier: start.tier,
						fromDivision: divisionName(start.divisionId),
						fromSeason: start.season,
						seasons: season - start.season + 1,
					},
				});
			}
		}

		// A yo-yo club, the season it becomes one
		if (entry.moved) {
			const recent = history.filter(
				(e) => e.season > season - settings.yoYoSeasons,
			);
			const count = (moved: "promoted" | "relegated") =>
				recent.filter((e) => e.moved === moved).length;
			const otherMove = entry.moved === "promoted" ? "relegated" : "promoted";
			if (
				count(entry.moved) === settings.yoYoMoves &&
				count(otherMove) >= settings.yoYoMoves
			) {
				add({
					kind: "yoYo",
					tids: [club.tid],
					significance: 30,
					facts: {
						promotions: count("promoted"),
						relegations: count("relegated"),
						seasons: settings.yoYoSeasons,
					},
				});
			}
		}

		// Unbeaten and winless seasons (a tie counts as neither a win nor a loss)
		const runs = club.runs;
		if (runs && runs.longestLosing === 0 && runs.longestUnbeaten > 0) {
			add({
				kind: "unbeaten",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: 80,
				facts: { division: divisionName(entry.divisionId) },
			});
		} else if (runs && runs.longestWinning === 0 && runs.longestWinless > 0) {
			add({
				kind: "winless",
				divisionId: entry.divisionId,
				tids: [club.tid],
				significance: 40,
				facts: { division: divisionName(entry.divisionId) },
			});
		}
	}

	return stories.sort((a, b) => b.significance - a.significance);
};

/**
 * A story in words. `club` names a club (a link in the game, plain text in
 * tests), and the first club named is the one the story is about.
 */
const ORDINALS = ["", "", "second", "third", "fourth", "fifth", "sixth"];

// "A", "A and B", or "A, B, and C"
const list = (items: string[]) =>
	items.length <= 2
		? items.join(" and ")
		: `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

export const writeWorldStory = (
	story: WorldStory,
	club: (tid: number) => string,
) => {
	const { facts, tids } = story;
	const main = club(tids[0]!);
	switch (story.kind) {
		case "titleRace":
			return facts.margin === 0
				? `${main} won the ${facts.division} on tiebreakers, level on points with ${club(tids[1]!)}.`
				: `${main} won the ${facts.division} by ${facts.margin} point${facts.margin === 1 ? "" : "s"} from ${club(tids[1]!)}.`;
		case "titleDefended": {
			const n = facts.titlesInRow as number;
			return n === 2
				? `${main} kept their ${facts.division} title.`
				: `${main} are ${facts.division} champions for the ${ORDINALS[n] ?? `${n}th`} season in a row.`;
		}
		case "promotedChampions":
			return `${main} won the ${facts.division} a season after being promoted.`;
		case "dynasty":
			return `A dynasty: ${main} have won ${facts.titles} ${facts.division} titles in ${facts.seasons} seasons.`;
		case "endOfEra":
			return `The end of an era: ${main} have gone two seasons without a title, after winning ${facts.titles} from ${facts.from} to ${facts.to}.`;
		case "challengerTitle":
			return `${main} broke the big clubs' grip on the ${facts.division}, finishing ahead of ${list(tids.slice(1).map(club))}.`;
		case "fallenGiant":
			return `Fallen giants: ${main} were relegated from the ${facts.division}.`;
		case "climb":
			return `${main} have climbed from the ${facts.fromDivision} to the top flight in ${facts.seasons} seasons.`;
		case "yoYo":
			return `${main} have gone up ${facts.promotions} times and down ${facts.relegations} times in ${facts.seasons} seasons.`;
		case "recordPoints":
			return `${main} set a ${facts.division} record with ${facts.points} points, beating ${facts.previousRecord}.`;
		case "fewestPoints":
			return `${main} finished with ${facts.points} points, the fewest ever in the ${facts.division}.`;
		case "unbeaten":
			return `${main} went the whole ${facts.division} season unbeaten.`;
		case "winless":
			return `${main} went the whole ${facts.division} season without a win.`;
	}
};
