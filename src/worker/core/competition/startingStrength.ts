// International Soccer Zen GM mod (Epic 7): which club starts a new World with
// which squad. Decided: top-tier clubs get the strongest squads, and within a
// tier bigger clubs lean stronger, with a little randomness so a second-tier club
// occasionally starts stronger than a weak top-tier one.

// Within a tier, a club's place by market size moves it down the order by up to
// this much, where a whole tier is 1
export const SQUAD_ORDER_MARKET_WEIGHT = 0.8;

// The standard deviation of the randomness in the order, on the same scale
export const SQUAD_ORDER_NOISE = 0.12;

// A normally distributed number from two uniform ones (Box-Muller)
const gaussian = (random: () => number) => {
	const u = 1 - random();
	const v = random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * The order clubs get squads in, first gets the strongest: by tier, then by
 * market size within a tier (every Country's clubs on a tier together), plus
 * some randomness. `random` is uniform on [0, 1).
 */
export const getSquadOrder = ({
	clubs,
	random = Math.random,
}: {
	clubs: { tid: number; tier: number; pop: number }[];
	random?: () => number;
}) => {
	const keyByTid = new Map<number, number>();
	for (const tier of new Set(clubs.map((club) => club.tier))) {
		const tierClubs = clubs
			.filter((club) => club.tier === tier)
			.sort((a, b) => b.pop - a.pop);
		for (const [i, club] of tierClubs.entries()) {
			const marketPlace = tierClubs.length > 1 ? i / (tierClubs.length - 1) : 0;
			keyByTid.set(
				club.tid,
				tier +
					SQUAD_ORDER_MARKET_WEIGHT * marketPlace +
					SQUAD_ORDER_NOISE * gaussian(random),
			);
		}
	}

	return clubs
		.map((club) => club.tid)
		.sort((a, b) => keyByTid.get(a)! - keyByTid.get(b)!);
};

/**
 * Which club gets each squad: the strongest squad (by team ovr) goes to the
 * first club in `order`, the next to the second, and so on. Returns each
 * squad's new tid by its current tid.
 */
export const assignSquads = ({
	squadOvrs,
	order,
}: {
	squadOvrs: { tid: number; ovr: number }[];
	order: number[];
}) => {
	const newTidByTid = new Map<number, number>();
	const strongestFirst = [...squadOvrs].sort((a, b) => b.ovr - a.ovr);
	for (const [i, squad] of strongestFirst.entries()) {
		const newTid = order[i];
		if (newTid !== undefined) {
			newTidByTid.set(squad.tid, newTid);
		}
	}
	return newTidByTid;
};
