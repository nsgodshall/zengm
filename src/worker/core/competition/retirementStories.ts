// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 4): the story of a club legend hanging up his boots. Only players who meant
// something to a club get one, so a squad's worth of retirements each summer
// doesn't flood the news.

// Thresholds are in seasons' worth of games, not appearances, since a World's
// Divisions play as many games as their size decides (and other sports play
// different numbers again)
export const RETIREMENT_STORY_SETTINGS = {
	// Seasons' worth of games for one club that make a player its legend
	seasons: 4,
	// Fewer will do for a player who never played anywhere else
	oneClubSeasons: 3,
	// Or for one who came through the club's academy
	academySeasons: 3.5,
	// However few he played, a club's all-time leader in appearances or scoring
	// gets his story, as long as he played this much
	leaderSeasons: 1.5,
	// Significance: a legend's floor, plus this much for each title he won at
	// the club and for each season's worth of games he played, capped
	baseSignificance: 35,
	significancePerTitle: 6,
	significancePerSeason: 2,
	maxSignificance: 80,
};

export type RetiringPlayer = {
	pid: number;
	name: string;
	age: number;
	// Regular season appearances and scoring for each club he played for
	byTid: {
		tid: number;
		gp: number;
		value: number;
		firstSeason: number;
		lastSeason: number;
	}[];
	// Every club he played for, so a one-club player can be recognized
	statsTids: number[];
	// Clubs whose academy he came through
	academyTids: number[];
};

export type RetirementStoryFacts = {
	pid: number;
	name: string;
	age: number;
	tid: number;
	gp: number;
	value: number;
	firstSeason: number;
	lastSeason: number;
	titles: number;
	oneClub: boolean;
	academy: boolean;
	// What he ends up top of the club's all-time lists in
	leader: ("appearances" | "scoring")[];
	significance: number;
};

/**
 * The club a retiring player is remembered at: where he played the most, with
 * ties going to where he played longest and then to the lower tid
 */
export const getMainClub = (p: RetiringPlayer) =>
	[...p.byTid].sort(
		(a, b) =>
			b.gp - a.gp ||
			b.lastSeason - b.firstSeason - (a.lastSeason - a.firstSeason) ||
			a.tid - b.tid,
	)[0];

/**
 * Whether a retiring player is worth looking his club's all-time bests up for.
 * Most players who retire played nowhere near long enough at one club to be
 * anybody's legend, and the bests cost a database read.
 */
export const couldBeALegend = (
	player: RetiringPlayer,
	gamesPerSeason: number,
) =>
	(getMainClub(player)?.gp ?? 0) >=
	RETIREMENT_STORY_SETTINGS.leaderSeasons * gamesPerSeason;

/**
 * The facts behind a retiring player's story, or undefined if his career
 * doesn't warrant one. `club` is his main club's all-time leaders and the
 * seasons it won its Division, which decide whether he's a legend there.
 */
export const getRetirementStory = ({
	player,
	club,
	gamesPerSeason,
}: {
	player: RetiringPlayer;
	club: {
		// The club's best all-time totals, his own included
		mostAppearances: number;
		mostScoring: number;
		// The seasons the club was champion of its Division
		titleSeasons: number[];
	};
	// How many games its Division plays in a season
	gamesPerSeason: number;
}): RetirementStoryFacts | undefined => {
	const settings = RETIREMENT_STORY_SETTINGS;
	const games = (seasons: number) => seasons * Math.max(1, gamesPerSeason);
	const main = getMainClub(player);
	if (!main || main.gp <= 0) {
		return;
	}

	const oneClub = player.statsTids.every((tid) => tid === main.tid);
	const academy = player.academyTids.includes(main.tid);
	const leader: RetirementStoryFacts["leader"] = [];
	const leaderGames = games(settings.leaderSeasons);
	if (main.gp >= club.mostAppearances && main.gp >= leaderGames) {
		leader.push("appearances");
	}
	if (
		main.value > 0 &&
		main.value >= club.mostScoring &&
		main.gp >= leaderGames
	) {
		leader.push("scoring");
	}

	const enough =
		leader.length > 0 ||
		main.gp >= games(settings.seasons) ||
		(oneClub && main.gp >= games(settings.oneClubSeasons)) ||
		(academy && main.gp >= games(settings.academySeasons));
	if (!enough) {
		return;
	}

	const titles = club.titleSeasons.filter(
		(season) => season >= main.firstSeason && season <= main.lastSeason,
	).length;

	return {
		pid: player.pid,
		name: player.name,
		age: player.age,
		tid: main.tid,
		gp: main.gp,
		value: main.value,
		firstSeason: main.firstSeason,
		lastSeason: main.lastSeason,
		titles,
		oneClub,
		academy,
		leader,
		significance: Math.min(
			settings.maxSignificance,
			Math.round(
				settings.baseSignificance +
					settings.significancePerTitle * titles +
					(settings.significancePerSeason * main.gp) /
						Math.max(1, gamesPerSeason),
			),
		),
	};
};

/**
 * How a retirement reads. `club` is the club's name, `scoring` the name of the
 * sport's scoring stat ("goals" in soccer terms, "points" in basketball's).
 */
export const describeRetirement = ({
	facts,
	club,
	scoring,
}: {
	facts: RetirementStoryFacts;
	club: string;
	scoring: string;
}) => {
	const seasons = facts.lastSeason - facts.firstSeason + 1;
	const who = facts.oneClub
		? `${facts.name} has retired at ${facts.age} having played for nobody but ${club}`
		: facts.academy
			? `${facts.name} has retired at ${facts.age}, ${seasons} ${seasons === 1 ? "season" : "seasons"} after coming through the ${club} academy`
			: `${facts.name} has retired at ${facts.age} after ${seasons} ${seasons === 1 ? "season" : "seasons"} at ${club}`;

	const parts = [`${facts.gp} appearances`];
	if (facts.value > 0) {
		parts.push(`${facts.value} ${scoring}`);
	}
	if (facts.titles > 0) {
		parts.push(`${facts.titles} ${facts.titles === 1 ? "title" : "titles"}`);
	}

	let text = `${who}: ${parts.join(", ")}.`;
	if (facts.leader.length === 2) {
		text += ` Nobody has played more games or scored more for the club.`;
	} else if (facts.leader[0] === "appearances") {
		text += ` Nobody has played more games for the club.`;
	} else if (facts.leader[0] === "scoring") {
		text += ` Nobody has scored more for the club.`;
	}
	return text;
};
