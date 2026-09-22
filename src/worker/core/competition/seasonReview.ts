// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 7): a season review written by a language model from the facts a season
// already saved, decided with the user. The model writes the prose; it is never
// the source of a fact. Templates stay the default and the fallback, so a World
// with no model reads exactly as it does now.
//
// This module is pure: it builds the prompt and checks what comes back.
// competition/writeSeasonReview.ts does the asking and the saving.

export const SEASON_REVIEW_SETTINGS = {
	// About how long a review should be, and the most it may run to before it's
	// treated as the model ignoring the brief
	words: 320,
	maxWords: 600,
	// The most stories to hand over, biggest first, so a busy season doesn't
	// bury the big ones
	maxStories: 16,
	temperature: 0.8,
	// How long to wait for a model before giving up
	timeoutMs: 60000,
};

export type SeasonReviewFacts = {
	season: number;
	country: string;
	// The Country's Divisions from the top, with what happened in each
	divisions: {
		name: string;
		tier: number;
		champion?: { name: string; points: number };
		promoted: string[];
		relegated: string[];
	}[];
	// The season's stories as they were told, biggest first
	stories: { kind: string; text: string }[];
};

const list = (names: string[]) =>
	names.length === 0 ? "nobody" : names.join(", ");

/** Every club the review is allowed to name */
export const getReviewClubs = (facts: SeasonReviewFacts) => {
	const clubs = new Set<string>();
	for (const division of facts.divisions) {
		if (division.champion) {
			clubs.add(division.champion.name);
		}
		for (const name of [...division.promoted, ...division.relegated]) {
			clubs.add(name);
		}
	}
	return clubs;
};

/**
 * What to ask for. `system` sets the voice and the rules, `user` hands over the
 * facts. Anything not in `user` is not available to write from.
 */
export const buildSeasonReviewPrompt = (facts: SeasonReviewFacts) => {
	const settings = SEASON_REVIEW_SETTINGS;

	const system = [
		"You write the end-of-season review for a football season, in the voice of a newspaper's season round-up: plain, unexcitable, specific.",
		`Write about ${settings.words} words as flowing paragraphs. No headings, no lists, no markdown, no title.`,
		"You may only use the facts given to you. Do not invent clubs, players, managers, scores, attendances, transfer fees or dates, and do not use anything you know about real-world football clubs of the same name.",
		"Every club you name must be one that appears in the facts. If you don't know something, leave it out rather than reaching for a plausible detail.",
		"Lead with whatever mattered most, tie the season's threads together, and end on what next season is set up to be.",
	].join(" ");

	const lines = [
		`Country: ${facts.country}`,
		`Season: ${facts.season}`,
		"",
		"Divisions, from the top:",
	];
	for (const division of facts.divisions) {
		lines.push(
			`- ${division.name}: champions ${
				division.champion
					? `${division.champion.name} on ${division.champion.points} points`
					: "none"
			}; promoted ${list(division.promoted)}; relegated ${list(
				division.relegated,
			)}`,
		);
	}

	const stories = facts.stories.slice(0, settings.maxStories);
	if (stories.length > 0) {
		lines.push("", "What happened, biggest first:");
		for (const story of stories) {
			lines.push(`- ${story.text}`);
		}
	}

	return { system, user: lines.join("\n") };
};

export type SeasonReviewProblem =
	| { kind: "empty" }
	| { kind: "tooLong"; words: number }
	| { kind: "missingChampion"; club: string }
	| { kind: "unknownYear"; year: number };

/**
 * What's wrong with a review, if anything. A model that made something up is
 * worse than no review at all, since the Chronicle is meant to be the record,
 * so this checks what can be checked: that it names the champions, and that
 * every year in it is one the facts know about.
 */
export const checkSeasonReview = ({
	text,
	facts,
	earliestSeason,
}: {
	text: string;
	facts: SeasonReviewFacts;
	// The first season the World played, so older years are inventions
	earliestSeason: number;
}): SeasonReviewProblem[] => {
	const problems: SeasonReviewProblem[] = [];

	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return [{ kind: "empty" }];
	}

	const words = trimmed.split(/\s+/).length;
	if (words > SEASON_REVIEW_SETTINGS.maxWords) {
		problems.push({ kind: "tooLong", words });
	}

	for (const division of facts.divisions) {
		if (division.champion && !trimmed.includes(division.champion.name)) {
			problems.push({
				kind: "missingChampion",
				club: division.champion.name,
			});
		}
	}

	for (const match of trimmed.matchAll(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/g)) {
		const year = Number(match[1]);
		if (year < earliestSeason || year > facts.season) {
			problems.push({ kind: "unknownYear", year });
		}
	}

	return problems;
};

export const describeReviewProblem = (problem: SeasonReviewProblem) => {
	switch (problem.kind) {
		case "empty":
			return "it came back empty";
		case "tooLong":
			return `it ran to ${problem.words} words`;
		case "missingChampion":
			return `it never mentions the champions, ${problem.club}`;
		case "unknownYear":
			return `it mentions ${problem.year}, which isn't a season this World has played`;
	}
};
