// International Soccer Zen GM mod (Epic 3): a promotion playoff as resumable
// state, so its rounds can be scheduled and played like any other games rather
// than simulated in one batch at the end of the season.
//
// The bracket rules are the same ones runPromotionPlayoff has always used, just
// expressed as "given the games played so far, what's left to play?" instead of
// a loop that plays the whole tournament:
//
// - Entrants are seeded by table position, best first.
// - Each round pairs the best remaining seed with the worst, and the better
//   seed is at home.
// - If the field isn't numSpots times a power of two, the top seeds get byes in
//   the first round so that it is afterwards.
// - A tied game sends the better seed through.
//
// Everything here is pure and deterministic: the same state always gives the
// same matchups, so reloading a save mid-round can't change the bracket.

export type PromotionPlayoffGame = {
	round: number;
	homeTid: number;
	awayTid: number;
	homePts: number;
	awayPts: number;
	winnerTid: number;
	// The box score's game id, from the schedule like any other game
	gid: number;
};

/** One link's playoff: who's in it, how many go up, and what's been played */
export type PromotionPlayoffLink = {
	linkId: number;
	// Seeded by table position, best first
	entrants: number[];
	numSpots: number;
	games: PromotionPlayoffGame[];
};

export type PromotionPlayoffMatchup = {
	linkId: number;
	round: number;
	homeTid: number;
	awayTid: number;
};

/**
 * The matchups of one round, given who's still in it. Empty once the field is
 * down to the clubs that go up.
 */
export const getRoundMatchups = (
	remaining: number[],
	numSpots: number,
): { homeTid: number; awayTid: number }[] => {
	if (numSpots <= 0 || remaining.length <= numSpots) {
		return [];
	}

	// Largest numSpots * 2^k below the current field is how many are left after
	// this round
	let target = numSpots;
	while (target * 2 < remaining.length) {
		target *= 2;
	}

	const numGames = remaining.length - target;
	const playing = remaining.slice(remaining.length - 2 * numGames);

	return Array.from({ length: numGames }, (_, i) => ({
		homeTid: playing[i]!,
		awayTid: playing[playing.length - 1 - i]!,
	}));
};

const getSeedByTid = (entrants: number[]) =>
	new Map(entrants.map((tid, seed) => [tid, seed]));

/**
 * Replay a link's completed games to find which round it's on, who's still in
 * it, and which of the round's games haven't been played yet.
 *
 * Throws if the saved games don't fit the bracket, rather than silently
 * inventing a different one.
 */
export const getLinkProgress = (link: PromotionPlayoffLink) => {
	if (link.numSpots > link.entrants.length) {
		throw new Error(
			`Promotion playoff link ${link.linkId} has ${link.numSpots} spot(s) but only ${link.entrants.length} entrant(s)`,
		);
	}

	const seedByTid = getSeedByTid(link.entrants);
	const gamesByRound = new Map<number, PromotionPlayoffGame[]>();
	for (const game of link.games) {
		gamesByRound.set(game.round, [
			...(gamesByRound.get(game.round) ?? []),
			game,
		]);
	}

	let remaining = [...link.entrants];
	let round = 0;

	while (true) {
		const matchups = getRoundMatchups(remaining, link.numSpots);
		if (matchups.length === 0) {
			// The field is down to the clubs that go up, or the link promotes
			// nobody through a playoff
			return {
				round,
				remaining,
				activeMatchups: [] as PromotionPlayoffMatchup[],
				done: true,
				winners: link.numSpots > 0 ? remaining : [],
			};
		}

		const played = gamesByRound.get(round) ?? [];
		const winnerByMatchup = new Map<string, number>();
		for (const game of played) {
			winnerByMatchup.set(`${game.homeTid}-${game.awayTid}`, game.winnerTid);
		}

		const activeMatchups: PromotionPlayoffMatchup[] = [];
		const winners: number[] = [];
		for (const matchup of matchups) {
			const winner = winnerByMatchup.get(
				`${matchup.homeTid}-${matchup.awayTid}`,
			);
			if (winner === undefined) {
				activeMatchups.push({ linkId: link.linkId, round, ...matchup });
			} else {
				if (winner !== matchup.homeTid && winner !== matchup.awayTid) {
					throw new Error(
						`Promotion playoff link ${link.linkId} round ${round}: ${winner} won a game between ${matchup.homeTid} and ${matchup.awayTid}`,
					);
				}
				winners.push(winner);
			}
		}

		if (activeMatchups.length > 0) {
			// This round is still being played
			return {
				round,
				remaining,
				activeMatchups,
				done: false,
				winners: [] as number[],
			};
		}

		// Byes are everyone who didn't play this round
		const playingTids = new Set(
			matchups.flatMap((matchup) => [matchup.homeTid, matchup.awayTid]),
		);
		const byes = remaining.filter((tid) => !playingTids.has(tid));

		remaining = [...byes, ...winners].sort(
			(a, b) => seedByTid.get(a)! - seedByTid.get(b)!,
		);
		round += 1;
	}
};

/** The games a link still needs to play right now, if any */
export const getActiveMatchups = (link: PromotionPlayoffLink) =>
	getLinkProgress(link).activeMatchups;

/** Whether a link has produced its promoted clubs */
export const isLinkDone = (link: PromotionPlayoffLink) =>
	getLinkProgress(link).done;

/**
 * The clubs going up, once the playoff is over. Throws while it's still being
 * played, so a caller can't promote anyone early.
 */
export const getLinkWinners = (link: PromotionPlayoffLink) => {
	const { done, winners } = getLinkProgress(link);
	if (!done) {
		throw new Error(
			`Promotion playoff link ${link.linkId} isn't finished, so it has no winners yet`,
		);
	}
	return winners;
};

/**
 * Who goes through, given a finished game: the club with more points, or the
 * better seed if it ended level.
 */
export const getGameWinner = ({
	entrants,
	homeTid,
	awayTid,
	homePts,
	awayPts,
}: {
	entrants: number[];
	homeTid: number;
	awayTid: number;
	homePts: number;
	awayPts: number;
}) => {
	if (homePts !== awayPts) {
		return homePts > awayPts ? homeTid : awayTid;
	}

	const seedByTid = getSeedByTid(entrants);
	const homeSeed = seedByTid.get(homeTid);
	const awaySeed = seedByTid.get(awayTid);
	if (homeSeed === undefined || awaySeed === undefined) {
		throw new Error(
			`Promotion playoff game between ${homeTid} and ${awayTid} has a club that isn't an entrant`,
		);
	}

	return homeSeed < awaySeed ? homeTid : awayTid;
};

/**
 * A link with one more game recorded. Throws if the game isn't one the bracket
 * is waiting for, so a stray result can't corrupt the state.
 */
export const recordGame = (
	link: PromotionPlayoffLink,
	game: PromotionPlayoffGame,
): PromotionPlayoffLink => {
	const expected = getActiveMatchups(link).some(
		(matchup) =>
			matchup.round === game.round &&
			matchup.homeTid === game.homeTid &&
			matchup.awayTid === game.awayTid,
	);
	if (!expected) {
		throw new Error(
			`Promotion playoff link ${link.linkId} isn't waiting for a round ${game.round} game between ${game.homeTid} and ${game.awayTid}`,
		);
	}

	return { ...link, games: [...link.games, game] };
};
