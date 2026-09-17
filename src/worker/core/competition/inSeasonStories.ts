import type { PromotionRelegationLink } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 4): stories told while a World's season is being played, checked after each
// day's games: a title, promotion, or relegation settled with games to spare,
// and long winning and losing runs. What's already been told this season is
// kept, so each is told once.

export const IN_SEASON_STORY_SETTINGS = {
	// Runs are told when they reach runStart games, then every runStep more
	runStart: 10,
	runStep: 5,
};

export type InSeasonStoryKind =
	| "titleClinched"
	| "promotionClinched"
	| "relegationConfirmed"
	| "winningRun"
	| "losingRun";

export type InSeasonStory = {
	kind: InSeasonStoryKind;
	divisionId: number;
	tid: number;
	significance: number;
	facts: Record<string, number>;
};

export type InSeasonStoryState = {
	season: number;
	titleClinched: number[];
	promotionClinched: number[];
	relegationConfirmed: number[];
	// The longest run of each kind already told, by tid
	winningRuns: Record<number, number>;
	losingRuns: Record<number, number>;
};

export const getEmptyInSeasonStoryState = (
	season: number,
): InSeasonStoryState => ({
	season,
	titleClinched: [],
	promotionClinched: [],
	relegationConfirmed: [],
	winningRuns: {},
	losingRuns: {},
});

export type InSeasonTableRow = {
	tid: number;
	points: number;
	played: number;
	winning: number;
	losing: number;
};

/**
 * Clubs guaranteed to finish in the top `places` of a table: fewer than
 * `places` other clubs can still reach their points, even winning every game
 * left. Ties count as reachable, since tiebreakers could go either way.
 */
export const getClinchedTopPlaces = ({
	rows,
	places,
	numGames,
	winPoints,
}: {
	rows: InSeasonTableRow[];
	places: number;
	numGames: number;
	winPoints: number;
}) =>
	rows.filter((row) => {
		const canReach = rows.filter(
			(other) =>
				other !== row &&
				other.points + Math.max(0, numGames - other.played) * winPoints >=
					row.points,
		).length;
		return canReach < places;
	});

/**
 * Clubs certain to finish in the bottom `places` of a table: at least
 * numClubs - places other clubs are out of reach, even if they win every game
 * left
 */
export const getConfirmedBottomPlaces = ({
	rows,
	places,
	numGames,
	winPoints,
}: {
	rows: InSeasonTableRow[];
	places: number;
	numGames: number;
	winPoints: number;
}) =>
	rows.filter((row) => {
		const maxPoints =
			row.points + Math.max(0, numGames - row.played) * winPoints;
		const outOfReach = rows.filter(
			(other) => other !== row && other.points > maxPoints,
		).length;
		return outOfReach >= rows.length - places;
	});

/**
 * New stories from the tables as they stand, and the state after telling them
 */
export const detectInSeasonStories = ({
	state,
	divisions,
	links,
}: {
	state: InSeasonStoryState;
	divisions: {
		divisionId: number;
		tier: number;
		numGames: number;
		winPoints: number;
		rows: InSeasonTableRow[];
	}[];
	links: Pick<
		PromotionRelegationLink,
		| "upperDivisionId"
		| "lowerDivisionId"
		| "numAutoPromoted"
		| "numAutoRelegated"
	>[];
}) => {
	const settings = IN_SEASON_STORY_SETTINGS;
	const next: InSeasonStoryState = {
		...state,
		titleClinched: [...state.titleClinched],
		promotionClinched: [...state.promotionClinched],
		relegationConfirmed: [...state.relegationConfirmed],
		winningRuns: { ...state.winningRuns },
		losingRuns: { ...state.losingRuns },
	};
	const stories: InSeasonStory[] = [];

	for (const division of divisions) {
		const { rows, numGames, winPoints, divisionId } = division;
		const gamesLeft = (tid: number) =>
			numGames - (rows.find((row) => row.tid === tid)?.played ?? numGames);
		// Settled with games still to play, so it's news
		const stillPlaying = rows.some((row) => row.played < numGames);

		if (stillPlaying && !next.titleClinched.includes(divisionId)) {
			const [champion] = getClinchedTopPlaces({
				rows,
				places: 1,
				numGames,
				winPoints,
			});
			if (champion) {
				next.titleClinched.push(divisionId);
				const left = gamesLeft(champion.tid);
				stories.push({
					kind: "titleClinched",
					divisionId,
					tid: champion.tid,
					significance: Math.min(70, 40 + 5 * left),
					facts: { gamesLeft: left, tier: division.tier },
				});
			}
		}

		const downLink = links.find((link) => link.upperDivisionId === divisionId);
		if (stillPlaying && downLink && downLink.numAutoRelegated > 0) {
			for (const row of getConfirmedBottomPlaces({
				rows,
				places: downLink.numAutoRelegated,
				numGames,
				winPoints,
			})) {
				if (!next.relegationConfirmed.includes(row.tid)) {
					next.relegationConfirmed.push(row.tid);
					stories.push({
						kind: "relegationConfirmed",
						divisionId,
						tid: row.tid,
						significance: 30,
						facts: { gamesLeft: gamesLeft(row.tid), tier: division.tier },
					});
				}
			}
		}

		const upLink = links.find((link) => link.lowerDivisionId === divisionId);
		if (stillPlaying && upLink && upLink.numAutoPromoted > 0) {
			for (const row of getClinchedTopPlaces({
				rows,
				places: upLink.numAutoPromoted,
				numGames,
				winPoints,
			})) {
				if (!next.promotionClinched.includes(row.tid)) {
					next.promotionClinched.push(row.tid);
					stories.push({
						kind: "promotionClinched",
						divisionId,
						tid: row.tid,
						significance: 35,
						facts: { gamesLeft: gamesLeft(row.tid), tier: division.tier },
					});
				}
			}
		}

		for (const row of rows) {
			for (const [kind, length, told] of [
				["winningRun", row.winning, next.winningRuns],
				["losingRun", row.losing, next.losingRuns],
			] as const) {
				const milestone =
					length >= settings.runStart
						? settings.runStart +
							Math.floor((length - settings.runStart) / settings.runStep) *
								settings.runStep
						: 0;
				if (milestone > 0 && milestone > (told[row.tid] ?? 0)) {
					told[row.tid] = milestone;
					stories.push({
						kind,
						divisionId,
						tid: row.tid,
						significance: Math.min(
							60,
							(kind === "winningRun" ? 25 : 15) + 2 * (milestone - 10),
						),
						facts: { games: milestone },
					});
				} else if (length === 0 && told[row.tid] !== undefined) {
					// The run is over, so a new one can be told from the start
					delete told[row.tid];
				}
			}
		}
	}

	return { stories, state: next };
};

/** An in-season story in words, with `club` naming the club and `division` its Division */
export const writeInSeasonStory = (
	story: InSeasonStory,
	club: string,
	division: string,
) => {
	const left = story.facts.gamesLeft ?? 0;
	const gamesLeftText = `${left} game${left === 1 ? "" : "s"}`;
	switch (story.kind) {
		case "titleClinched":
			return `${club} have won the ${division} with ${gamesLeftText} to spare.`;
		case "promotionClinched":
			return `${club} have sealed promotion from the ${division} with ${gamesLeftText} to spare.`;
		case "relegationConfirmed":
			return `${club} have been relegated from the ${division}, with ${gamesLeftText} still to play.`;
		case "winningRun":
			return `${club} have won ${story.facts.games} games in a row.`;
		case "losingRun":
			return `${club} have lost ${story.facts.games} games in a row.`;
	}
};
