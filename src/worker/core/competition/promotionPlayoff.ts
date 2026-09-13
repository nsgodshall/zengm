/**
 * Play a promotion playoff: a knockout among `participants` (best table
 * position first) until `numSpots` clubs are left, and those clubs go up.
 *
 * Each round pairs the best remaining seed with the worst, with the better seed
 * at home. If the field isn't numSpots times a power of two, the top seeds get
 * byes in the first round so that it is afterwards.
 *
 * `playGame` plays one game and returns the winner's tid. It's passed in so the
 * bracket stays independent of any sport's game simulation.
 */
const runPromotionPlayoff = async (
	participants: number[],
	numSpots: number,
	playGame: (homeTid: number, awayTid: number) => Promise<number>,
): Promise<number[]> => {
	if (numSpots <= 0) {
		return [];
	}
	if (numSpots > participants.length) {
		throw new Error(
			`Promotion playoff has ${numSpots} spot(s) but only ${participants.length} participant(s)`,
		);
	}

	const seedByTid = new Map(participants.map((tid, seed) => [tid, seed]));
	let remaining = [...participants];

	while (remaining.length > numSpots) {
		// Largest numSpots * 2^k below the current field is how many are left
		// after this round
		let target = numSpots;
		while (target * 2 < remaining.length) {
			target *= 2;
		}

		const numGames = remaining.length - target;
		const byes = remaining.slice(0, remaining.length - 2 * numGames);
		const playing = remaining.slice(byes.length);

		const winners: number[] = [];
		for (let i = 0; i < numGames; i++) {
			const homeTid = playing[i]!;
			const awayTid = playing[playing.length - 1 - i]!;
			const winner = await playGame(homeTid, awayTid);
			if (winner !== homeTid && winner !== awayTid) {
				throw new Error(
					`Promotion playoff game between ${homeTid} and ${awayTid} returned ${winner} as the winner`,
				);
			}
			winners.push(winner);
		}

		remaining = [...byes, ...winners].sort(
			(a, b) => seedByTid.get(a)! - seedByTid.get(b)!,
		);
	}

	return remaining;
};

export default runPromotionPlayoff;
