// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): a World club's legends, from the players who have played for it: most
// appearances, most scoring, one-club players, and academy graduates.

export const CLUB_LEGEND_SETTINGS = {
	// How many of each kind to name
	numLegends: 5,
};

type LegendStatsRow = {
	tid: number;
	season: number;
	playoffs: boolean;
	gp: number;
};

export type LegendPlayer<Row extends LegendStatsRow> = {
	pid: number;
	firstName: string;
	lastName: string;
	stats: Row[];
	// Every club he has played for
	statsTids: number[];
	transactions?: { type: string; tid: number }[];
};

export type Legend = {
	pid: number;
	name: string;
	gp: number;
	value: number;
	firstSeason: number;
	lastSeason: number;
	oneClub: boolean;
	academy: boolean;
};

/**
 * A club's legends. `getScore` is the sport's scoring stat for a stats row, the
 * same one its Division's Top Scorer award counts.
 */
export const getClubLegends = <Row extends LegendStatsRow>({
	players,
	tid,
	getScore,
	numLegends = CLUB_LEGEND_SETTINGS.numLegends,
}: {
	players: LegendPlayer<Row>[];
	tid: number;
	getScore: (row: Row) => number;
	numLegends?: number;
}) => {
	const legends: Legend[] = [];
	for (const p of players) {
		const rows = p.stats.filter(
			(row) => row.tid === tid && !row.playoffs && row.gp > 0,
		);
		if (rows.length === 0) {
			continue;
		}
		const seasons = rows.map((row) => row.season);
		legends.push({
			pid: p.pid,
			name: `${p.firstName} ${p.lastName}`,
			gp: rows.reduce((sum, row) => sum + row.gp, 0),
			value: rows.reduce((sum, row) => sum + (getScore(row) || 0), 0),
			firstSeason: Math.min(...seasons),
			lastSeason: Math.max(...seasons),
			oneClub: p.statsTids.every((other) => other === tid),
			academy: (p.transactions ?? []).some(
				(transaction) =>
					transaction.type === "academy" && transaction.tid === tid,
			),
		});
	}

	const byGp = (a: Legend, b: Legend) => b.gp - a.gp || a.pid - b.pid;
	const top = (rows: Legend[], sort: (a: Legend, b: Legend) => number) =>
		[...rows].sort(sort).slice(0, numLegends);

	return {
		mostAppearances: top(legends, byGp),
		topScorers: top(legends, (a, b) => b.value - a.value || byGp(a, b)),
		oneClubPlayers: top(
			legends.filter((legend) => legend.oneClub),
			byGp,
		),
		academyGraduates: top(
			legends.filter((legend) => legend.academy),
			byGp,
		),
	};
};
