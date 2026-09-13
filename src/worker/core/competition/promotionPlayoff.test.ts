import { expect, test } from "vitest";
import runPromotionPlayoff from "./promotionPlayoff.ts";

// Records every game, and decides it with `pickWinner`
const makePlayGame = (
	pickWinner: (homeTid: number, awayTid: number) => number,
) => {
	const games: [number, number][] = [];
	const playGame = async (homeTid: number, awayTid: number) => {
		games.push([homeTid, awayTid]);
		return pickWinner(homeTid, awayTid);
	};
	return { games, playGame };
};

const homeWins = (homeTid: number) => homeTid;
const awayWins = (_homeTid: number, awayTid: number) => awayTid;

test("4 clubs for 1 spot: semifinals best vs worst, then a final", async () => {
	const { games, playGame } = makePlayGame(homeWins);
	const winners = await runPromotionPlayoff([13, 14, 15, 16], 1, playGame);

	expect(games).toEqual([
		[13, 16],
		[14, 15],
		[13, 14],
	]);
	expect(winners).toEqual([13]);
});

test("the better remaining seed hosts, even after upsets", async () => {
	const { games, playGame } = makePlayGame(awayWins);
	const winners = await runPromotionPlayoff([13, 14, 15, 16], 1, playGame);

	// 16 and 15 win the semifinals, and 15 is the better seed of the two
	expect(games).toEqual([
		[13, 16],
		[14, 15],
		[15, 16],
	]);
	expect(winners).toEqual([16]);
});

test("3 clubs for 1 spot: the top seed gets a bye", async () => {
	const { games, playGame } = makePlayGame(homeWins);
	const winners = await runPromotionPlayoff([1, 2, 3], 1, playGame);

	expect(games).toEqual([
		[2, 3],
		[1, 2],
	]);
	expect(winners).toEqual([1]);
});

test("6 clubs for 2 spots: the top 2 seeds get byes, then 2 finals", async () => {
	const { games, playGame } = makePlayGame(homeWins);
	const winners = await runPromotionPlayoff([1, 2, 3, 4, 5, 6], 2, playGame);

	expect(games).toEqual([
		[3, 6],
		[4, 5],
		[1, 4],
		[2, 3],
	]);
	expect(winners).toEqual([1, 2]);
});

test("as many spots as clubs means no games, and no spots means nobody goes up", async () => {
	const { games, playGame } = makePlayGame(homeWins);
	expect(await runPromotionPlayoff([1, 2], 2, playGame)).toEqual([1, 2]);
	expect(await runPromotionPlayoff([1, 2], 0, playGame)).toEqual([]);
	expect(games).toEqual([]);
});

test("throws for more spots than clubs, or a winner who wasn't in the game", async () => {
	const { playGame } = makePlayGame(homeWins);
	await expect(runPromotionPlayoff([1], 2, playGame)).rejects.toThrow(
		/2 spot\(s\) but only 1 participant/,
	);

	const { playGame: brokenPlayGame } = makePlayGame(() => 99);
	await expect(runPromotionPlayoff([1, 2], 1, brokenPlayGame)).rejects.toThrow(
		/returned 99 as the winner/,
	);
});
