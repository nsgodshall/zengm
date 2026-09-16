import { describe, expect, test } from "vitest";
import {
	getActiveMatchups,
	getGameWinner,
	getLinkProgress,
	getLinkWinners,
	type PromotionPlayoffLink,
	recordGame,
} from "./promotionPlayoffState.ts";

const link = (
	entrants: number[],
	numSpots: number,
	games: PromotionPlayoffLink["games"] = [],
): PromotionPlayoffLink => ({ linkId: 2, entrants, numSpots, games });

// Play the matchup the bracket is waiting for, with `pickWinner` deciding it
const play = (
	state: PromotionPlayoffLink,
	pickWinner: (homeTid: number, awayTid: number) => number,
	gid = state.games.length,
) => {
	const matchup = getActiveMatchups(state)[0]!;
	const winnerTid = pickWinner(matchup.homeTid, matchup.awayTid);
	return recordGame(state, {
		round: matchup.round,
		homeTid: matchup.homeTid,
		awayTid: matchup.awayTid,
		homePts: winnerTid === matchup.homeTid ? 2 : 1,
		awayPts: winnerTid === matchup.homeTid ? 1 : 2,
		winnerTid,
		gid,
	});
};

const homeWins = (homeTid: number) => homeTid;
const awayWins = (_homeTid: number, awayTid: number) => awayTid;

const matchupTids = (state: PromotionPlayoffLink) =>
	getActiveMatchups(state).map((matchup) => [matchup.homeTid, matchup.awayTid]);

describe("getActiveMatchups", () => {
	test("4 clubs for 1 spot: both semifinals at once, then a final", () => {
		let state = link([13, 14, 15, 16], 1);
		expect(matchupTids(state)).toEqual([
			[13, 16],
			[14, 15],
		]);

		// One semifinal played doesn't start the final
		state = play(state, homeWins);
		expect(matchupTids(state)).toEqual([[14, 15]]);
		expect(getLinkProgress(state).done).toBe(false);

		state = play(state, homeWins);
		expect(matchupTids(state)).toEqual([[13, 14]]);
		expect(getLinkProgress(state).round).toBe(1);

		state = play(state, homeWins);
		expect(getActiveMatchups(state)).toEqual([]);
		expect(getLinkWinners(state)).toEqual([13]);
	});

	test("the better remaining seed hosts, even after upsets", () => {
		let state = link([13, 14, 15, 16], 1);
		state = play(state, awayWins);
		state = play(state, awayWins);

		// 16 and 15 won, and 15 is the better seed of the two
		expect(matchupTids(state)).toEqual([[15, 16]]);
	});

	test("3 clubs for 1 spot: the top seed gets a bye", () => {
		let state = link([1, 2, 3], 1);
		expect(matchupTids(state)).toEqual([[2, 3]]);

		state = play(state, homeWins);
		expect(matchupTids(state)).toEqual([[1, 2]]);
	});

	test("6 clubs for 2 spots: the top 2 seeds get byes, then 2 finals", () => {
		let state = link([1, 2, 3, 4, 5, 6], 2);
		expect(matchupTids(state)).toEqual([
			[3, 6],
			[4, 5],
		]);

		state = play(state, homeWins);
		state = play(state, homeWins);
		expect(matchupTids(state)).toEqual([
			[1, 4],
			[2, 3],
		]);

		state = play(state, homeWins);
		state = play(state, homeWins);
		expect(getLinkWinners(state)).toEqual([1, 2]);
	});

	test("as many spots as clubs means no games, and no spots means nobody goes up", () => {
		expect(getActiveMatchups(link([1, 2], 2))).toEqual([]);
		expect(getLinkWinners(link([1, 2], 2))).toEqual([1, 2]);
		expect(getLinkWinners(link([1, 2], 0))).toEqual([]);
	});
});

describe("getLinkWinners", () => {
	test("throws while the playoff is still being played", () => {
		expect(() => getLinkWinners(link([1, 2], 1))).toThrow(/isn't finished/);
	});

	test("rejects more places than entrants", () => {
		expect(() => getLinkWinners(link([1], 2))).toThrow(
			/2 spot\(s\).*1 entrant/,
		);
	});
});

describe("getGameWinner", () => {
	test("the club with more points wins", () => {
		const game = { entrants: [1, 2], homeTid: 1, awayTid: 2 };
		expect(getGameWinner({ ...game, homePts: 2, awayPts: 1 })).toBe(1);
		expect(getGameWinner({ ...game, homePts: 1, awayPts: 2 })).toBe(2);
	});

	test("a tie sends the better seed through, whichever side it's on", () => {
		expect(
			getGameWinner({
				entrants: [1, 2],
				homeTid: 1,
				awayTid: 2,
				homePts: 2,
				awayPts: 2,
			}),
		).toBe(1);

		// The better seed is always at home in a real bracket, but don't depend
		// on it here
		expect(
			getGameWinner({
				entrants: [1, 2],
				homeTid: 2,
				awayTid: 1,
				homePts: 2,
				awayPts: 2,
			}),
		).toBe(1);
	});

	test("throws for a club that isn't in the playoff", () => {
		expect(() =>
			getGameWinner({
				entrants: [1, 2],
				homeTid: 1,
				awayTid: 99,
				homePts: 2,
				awayPts: 2,
			}),
		).toThrow(/isn't an entrant/);
	});
});

describe("recordGame", () => {
	test("keeps the state it's given and returns a new one", () => {
		const before = link([1, 2], 1);
		const after = play(before, homeWins);

		expect(before.games).toEqual([]);
		expect(after.games).toHaveLength(1);
	});

	test("rejects a game the bracket isn't waiting for", () => {
		const state = link([13, 14, 15, 16], 1);

		// 13 v 16 and 14 v 15 are this round, not 13 v 14
		expect(() =>
			recordGame(state, {
				round: 0,
				homeTid: 13,
				awayTid: 14,
				homePts: 2,
				awayPts: 1,
				winnerTid: 13,
				gid: 0,
			}),
		).toThrow(/isn't waiting for/);
	});

	test("rejects a winner who wasn't in the game", () => {
		const state = link([13, 14, 15, 16], 1, [
			{
				round: 0,
				homeTid: 13,
				awayTid: 16,
				homePts: 2,
				awayPts: 1,
				winnerTid: 99,
				gid: 0,
			},
		]);

		expect(() => getActiveMatchups(state)).toThrow(/99 won a game/);
	});
});
