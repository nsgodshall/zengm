// International Soccer Zen GM mod (Epic 6): a club's place in its Country's
// pyramid, for the league history chart on a club's history page, like the
// ones on soccer clubs' Wikipedia pages

/**
 * A club's overall place in its Country's pyramid in a season: its position in
 * its Division, after every club in the tiers above. 1 is the top of the top
 * tier. `clubsByTier` counts every club on each of the Country's tiers.
 */
export const getPyramidPosition = ({
	tier,
	position,
	clubsByTier,
}: {
	tier: number;
	position: number;
	clubsByTier: Map<number, number>;
}) => {
	let numAbove = 0;
	for (const [otherTier, numClubs] of clubsByTier) {
		if (otherTier < tier) {
			numAbove += numClubs;
		}
	}
	return numAbove + position;
};

/**
 * The overall places each tier of a Country's pyramid covers, top tier first
 */
export const getTierBands = (clubsByTier: Map<number, number>) => {
	const bands: { tier: number; first: number; last: number }[] = [];
	let first = 1;
	for (const tier of [...clubsByTier.keys()].sort((a, b) => a - b)) {
		const numClubs = clubsByTier.get(tier)!;
		bands.push({ tier, first, last: first + numClubs - 1 });
		first += numClubs;
	}
	return bands;
};
