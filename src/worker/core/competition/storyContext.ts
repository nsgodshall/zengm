import { helpers } from "../../../common/helpers.ts";
import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling): what a title, promotion, or
// relegation means in a club's history, for its news (see
// STORY_TELLING_PLAN.md, Phase 3). Only the World's own history counts, so a
// club's "first title" is its first since the World began; wording that would
// sound like "ever" waits until there's enough history to mean something.

export const STORY_CONTEXT_SETTINGS = {
	// "Their first title in N seasons" needs at least this many seasons without
	// one, and so do "their first relegation" and "ends N seasons in a Division"
	longWait: 10,
	// Extra news score for a rare story, on top of the usual event score
	rareBonus: 10,
	notableBonus: 5,
};

export type StoryContext = {
	// Full sentences, the most notable first
	sentences: string[];
	scoreBonus: number;
};

const WORDS = [
	"",
	"first",
	"second",
	"third",
	"fourth",
	"fifth",
	"sixth",
	"seventh",
	"eighth",
	"ninth",
	"tenth",
];
const ordinalWord = (n: number) => WORDS[n] ?? helpers.ordinal(n);

const seasonsText = (n: number) => `${n} season${n === 1 ? "" : "s"}`;

// A club's history before `season`, oldest first
const before = (history: WorldHistoryEntry[], season: number) =>
	history
		.filter((entry) => entry.season < season)
		.sort((a, b) => a.season - b.season);

// How many of the most recent entries in a row pass `test`
const countBack = (
	entries: WorldHistoryEntry[],
	test: (entry: WorldHistoryEntry) => boolean,
) => {
	let count = 0;
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i]!;
		const next = entries[i + 1];
		if (!test(entry) || (next && next.season !== entry.season + 1)) {
			break;
		}
		count += 1;
	}
	return count;
};

// The longest run of titles on a tier by any one club, from every club in a
// Country's histories
export const getLongestTitleRun = (
	histories: WorldHistoryEntry[][],
	tier: number,
) => {
	let longest = 0;
	for (const history of histories) {
		const titles = history
			.filter((entry) => entry.champion && entry.tier === tier)
			.map((entry) => entry.season)
			.sort((a, b) => a - b);
		let run = 0;
		for (const [i, season] of titles.entries()) {
			run = i > 0 && titles[i - 1] === season - 1 ? run + 1 : 1;
			longest = Math.max(longest, run);
		}
	}
	return longest;
};

/**
 * A club winning its Division on `tier` in `season`, given its history and the
 * longest title run on that tier in its Country before this season
 */
export const describeTitle = ({
	history: fullHistory,
	season,
	tier,
	countryRecordRun,
}: {
	history: WorldHistoryEntry[];
	season: number;
	tier: number;
	countryRecordRun: number;
}): StoryContext => {
	const settings = STORY_CONTEXT_SETTINGS;
	const history = before(fullHistory, season);
	const last = history.at(-1);
	const lastSeasonIsPrevious = last?.season === season - 1;

	const titlesInRow =
		1 +
		(lastSeasonIsPrevious
			? countBack(history, (entry) => !!entry.champion && entry.tier === tier)
			: 0);
	if (titlesInRow >= 3 && titlesInRow > countryRecordRun) {
		return {
			sentences: [`It's a record ${ordinalWord(titlesInRow)} title in a row.`],
			scoreBonus: settings.rareBonus,
		};
	}
	if (titlesInRow >= 3 && titlesInRow === countryRecordRun) {
		return {
			sentences: [
				`It's their ${ordinalWord(titlesInRow)} title in a row, equalling the record.`,
			],
			scoreBonus: settings.rareBonus,
		};
	}
	if (titlesInRow >= 2) {
		return {
			sentences: [
				titlesInRow === 2
					? "They're champions for the second season in a row."
					: `It's their ${ordinalWord(titlesInRow)} title in a row.`,
			],
			scoreBonus: titlesInRow >= 3 ? settings.notableBonus : 0,
		};
	}

	if (lastSeasonIsPrevious && last.tier > tier) {
		return {
			sentences: ["They were only promoted last season."],
			scoreBonus: settings.rareBonus,
		};
	}

	const titles = history.filter(
		(entry) => entry.champion && entry.tier === tier,
	);
	// Titles close together but not in a row, like 3 in 5 seasons
	const recentTitles = titles.filter((entry) => entry.season > season - 5);
	if (recentTitles.length + 1 >= 3) {
		const span = season - recentTitles[0]!.season + 1;
		return {
			sentences: [
				`It's their ${ordinalWord(recentTitles.length + 1)} title in ${seasonsText(span)}.`,
			],
			scoreBonus: settings.notableBonus,
		};
	}

	const lastTitle = titles.at(-1);
	if (lastTitle && season - lastTitle.season >= settings.longWait) {
		return {
			sentences: [`It's their first title since ${lastTitle.season}.`],
			scoreBonus: settings.rareBonus,
		};
	}
	if (!lastTitle && history.length >= settings.longWait) {
		return {
			sentences: [
				`It's their first title in ${seasonsText(history.length + 1)}.`,
			],
			scoreBonus: settings.rareBonus,
		};
	}

	return { sentences: [], scoreBonus: 0 };
};

/**
 * A club promoted from `fromTier` to `toTier` (named `toName`) at the end of
 * `season`, given its history
 */
export const describePromotion = ({
	history: fullHistory,
	season,
	toTier,
	toName,
}: {
	history: WorldHistoryEntry[];
	season: number;
	toTier: number;
	toName: string;
}): StoryContext => {
	const settings = STORY_CONTEXT_SETTINGS;
	const history = before(fullHistory, season);
	const sentences: string[] = [];
	let scoreBonus = 0;

	const last = history.at(-1);
	const lastSeasonIsPrevious = last?.season === season - 1;
	const lastAtTier = history.findLast((entry) => entry.tier <= toTier);

	if (
		lastSeasonIsPrevious &&
		last.moved === "relegated" &&
		last.tier === toTier
	) {
		sentences.push("They bounce straight back after one season down.");
	} else if (lastAtTier) {
		const seasonsAway = season - lastAtTier.season;
		if (seasonsAway >= 2) {
			sentences.push(
				`They're back in the ${toName} after ${seasonsText(seasonsAway)} away.`,
			);
			if (seasonsAway >= settings.longWait) {
				scoreBonus = settings.rareBonus;
			}
		}
	} else if (history.length >= settings.longWait) {
		sentences.push(
			`They reach the ${toName} for the first time in ${seasonsText(history.length + 1)}.`,
		);
		scoreBonus = settings.rareBonus;
	}

	const promotionsInRow =
		1 +
		(lastSeasonIsPrevious
			? countBack(history, (entry) => entry.moved === "promoted")
			: 0);
	if (promotionsInRow >= 2) {
		sentences.unshift(
			`It's their ${ordinalWord(promotionsInRow)} promotion in a row.`,
		);
		scoreBonus = Math.max(
			scoreBonus,
			promotionsInRow >= 3 ? settings.rareBonus : settings.notableBonus,
		);
	}

	return { sentences: sentences.slice(0, 2), scoreBonus };
};

/**
 * A club relegated from `fromTier` (named `fromName`) at the end of `season`,
 * given its history
 */
export const describeRelegation = ({
	history: fullHistory,
	season,
	fromTier,
	fromName,
}: {
	history: WorldHistoryEntry[];
	season: number;
	fromTier: number;
	fromName: string;
}): StoryContext => {
	const settings = STORY_CONTEXT_SETTINGS;
	const history = before(fullHistory, season);
	const sentences: string[] = [];
	let scoreBonus = 0;

	const last = history.at(-1);
	const lastSeasonIsPrevious = last?.season === season - 1;

	const recentTitle = history.findLast(
		(entry) =>
			entry.champion && entry.tier === fromTier && entry.season >= season - 3,
	);
	if (recentTitle) {
		const seasonsAgo = season - recentTitle.season;
		sentences.push(
			seasonsAgo === 1
				? "They were champions only last season."
				: `They were champions just ${seasonsText(seasonsAgo)} ago.`,
		);
		scoreBonus = settings.rareBonus;
	}

	if (lastSeasonIsPrevious && last.moved === "promoted") {
		sentences.push("They go straight back down after one season.");
	}

	const relegationsInRow =
		1 +
		(lastSeasonIsPrevious
			? countBack(history, (entry) => entry.moved === "relegated")
			: 0);
	if (relegationsInRow >= 2) {
		sentences.push(
			`It's their ${ordinalWord(relegationsInRow)} relegation in a row.`,
		);
		scoreBonus = Math.max(scoreBonus, settings.notableBonus);
	}

	// Seasons in a row on this tier, counting this one
	const seasonsUp =
		1 +
		(lastSeasonIsPrevious
			? countBack(history, (entry) => entry.tier === fromTier)
			: 0);
	if (seasonsUp >= settings.longWait) {
		sentences.push(`It ends ${seasonsText(seasonsUp)} in the ${fromName}.`);
		scoreBonus = settings.rareBonus;
	} else if (
		history.length >= settings.longWait &&
		!history.some((entry) => entry.moved === "relegated")
	) {
		sentences.push(
			`It's their first relegation in ${seasonsText(history.length + 1)}.`,
		);
		scoreBonus = settings.rareBonus;
	}

	return { sentences: sentences.slice(0, 2), scoreBonus };
};
