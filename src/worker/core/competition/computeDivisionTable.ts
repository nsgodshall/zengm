export type ClubSeasonResult = {
	tid: number;
	won: number;
	lost: number;
	tied: number;
	// Stand-in for "goal difference" - cumulative scoring margin. See ROADMAP.md's
	// open questions about capping it per game to discourage blowout-farming.
	pointDiff: number;
	// Stand-in for "goals scored," used as a later tiebreak the way real soccer
	// tables do.
	scored: number;
	// International Soccer Zen GM mod (storytelling, Phase 6c): points taken off
	// the club this season, as real leagues do to a club in administration
	pointsDeduction?: number;
};

export type DivisionTableRow = ClubSeasonResult & {
	rank: number;
	points: number;
};

export type HeadToHeadRecord = {
	won: number;
	lost: number;
	tied: number;
};

export type DivisionTableOptions = {
	winPoints?: number;
	tiePoints?: number;
	lossPoints?: number;
	// A club's record in its games against another club, if they played
	getHeadToHead?: (
		tid: number,
		otherTid: number,
	) => HeadToHeadRecord | undefined;
};

/**
 * Turn one Division's season results into an ordered table, soccer-style.
 * Clubs are sorted by:
 *
 * 1. points (a win/tie/loss is worth `winPoints`/`tiePoints`/`lossPoints`,
 *    3/1/0 by default)
 * 2. point differential
 * 3. points from head-to-head games among the clubs still level after 1 and 2,
 *    if `getHeadToHead` is given
 * 4. the "goals scored" equivalent
 * 5. total wins
 * 6. tid, so the ordering is always deterministic given the same inputs
 *
 * Deliberately sport-agnostic — nothing here assumes basketball, or even
 * assumes a particular sport's stat names beyond the generic fields above.
 */
const computeDivisionTable = (
	results: ClubSeasonResult[],
	options: DivisionTableOptions = {},
): DivisionTableRow[] => {
	const winPoints = options.winPoints ?? 3;
	const tiePoints = options.tiePoints ?? 1;
	const lossPoints = options.lossPoints ?? 0;
	const getPoints = (record: HeadToHeadRecord) =>
		record.won * winPoints + record.tied * tiePoints + record.lost * lossPoints;

	const withPoints = results.map((result) => ({
		...result,
		points: getPoints(result) - (result.pointsDeduction ?? 0),
	}));
	withPoints.sort((a, b) => b.points - a.points || b.pointDiff - a.pointDiff);

	// Head-to-head only means something among the clubs still level, so rank each
	// such group on a mini-table of just their games against each other. Pairwise
	// comparisons can go in circles with 3 or more clubs.
	const sorted: typeof withPoints = [];
	let start = 0;
	while (start < withPoints.length) {
		const first = withPoints[start]!;
		let end = start + 1;
		while (
			end < withPoints.length &&
			withPoints[end]!.points === first.points &&
			withPoints[end]!.pointDiff === first.pointDiff
		) {
			end += 1;
		}

		const group = withPoints.slice(start, end);
		const headToHeadPoints = new Map<number, number>();
		for (const row of group) {
			let total = 0;
			if (options.getHeadToHead && group.length > 1) {
				for (const other of group) {
					if (other.tid !== row.tid) {
						const record = options.getHeadToHead(row.tid, other.tid);
						if (record) {
							total += getPoints(record);
						}
					}
				}
			}
			headToHeadPoints.set(row.tid, total);
		}

		group.sort(
			(a, b) =>
				headToHeadPoints.get(b.tid)! - headToHeadPoints.get(a.tid)! ||
				b.scored - a.scored ||
				b.won - a.won ||
				a.tid - b.tid,
		);
		sorted.push(...group);

		start = end;
	}

	return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
};

export default computeDivisionTable;
