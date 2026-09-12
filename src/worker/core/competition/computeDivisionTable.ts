export type ClubSeasonResult = {
	tid: number;
	won: number;
	lost: number;
	tied: number;
	// Stand-in for "goal difference" until Epic 3 picks a concrete basketball
	// analog (see ROADMAP.md's open questions) — e.g. cumulative scoring
	// margin, possibly capped per game to discourage blowout-farming.
	pointDiff: number;
	// Stand-in for "goals scored," used as a secondary tiebreak the way real
	// soccer tables do.
	scored: number;
};

export type DivisionTableRow = ClubSeasonResult & {
	rank: number;
	points: number;
};

export type DivisionTableOptions = {
	winPoints?: number;
	tiePoints?: number;
	lossPoints?: number;
};

const DEFAULT_OPTIONS: Required<DivisionTableOptions> = {
	winPoints: 3,
	tiePoints: 1,
	lossPoints: 0,
};

/**
 * Turn one Division's season results into an ordered table, soccer-style:
 * sorted by points (win/tie/loss worth `winPoints`/`tiePoints`/`lossPoints`,
 * 3/1/0 by default), then point differential, then the "goals scored"
 * equivalent, then total wins, with tid as a final stable tiebreak so the
 * ordering is always deterministic given the same inputs.
 *
 * Deliberately sport-agnostic — nothing here assumes basketball, or even
 * assumes a particular sport's stat names beyond the generic fields above.
 *
 * Head-to-head tiebreaking is intentionally NOT handled here — this function
 * only sees aggregate season totals, not individual results. That's a
 * reasonable Epic 3 refinement once real match data is available (see
 * ROADMAP.md's open questions).
 */
const computeDivisionTable = (
	results: ClubSeasonResult[],
	options: DivisionTableOptions = {},
): DivisionTableRow[] => {
	const { winPoints, tiePoints, lossPoints } = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const withPoints = results.map((result) => ({
		...result,
		points:
			result.won * winPoints +
			result.tied * tiePoints +
			result.lost * lossPoints,
	}));

	const sorted = [...withPoints].sort((a, b) => {
		if (a.points !== b.points) {
			return b.points - a.points;
		}
		if (a.pointDiff !== b.pointDiff) {
			return b.pointDiff - a.pointDiff;
		}
		if (a.scored !== b.scored) {
			return b.scored - a.scored;
		}
		if (a.won !== b.won) {
			return b.won - a.won;
		}
		// Final stable tiebreak, purely so output is deterministic in tests
		// and doesn't depend on sort stability guarantees elsewhere.
		return a.tid - b.tid;
	});

	return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
};

export default computeDivisionTable;
