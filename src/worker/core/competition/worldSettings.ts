// International Soccer Zen GM mod (Epics 4 and 7): where a new World's clubs
// differ from a ZenGM league's teams

// Decided: a World's rosters are bigger than ZenGM's, closer to a soccer squad,
// to leave room for loans, academy promotions, and transfers. Like ZenGM, clubs
// start with, and sign free agents up to, 2 below the limit (see
// getNumPlayersPerTeam and freeAgents.getBest).
export const WORLD_MAX_ROSTER_SIZE = 18;

export const MIN_STADIUM_CAPACITY = 10_000;
export const MAX_STADIUM_CAPACITY = 80_000;

/**
 * Decided: a World club's stadium is sized by its market, `pop` in millions like
 * a team's pop, so big clubs earn more from tickets. It's about what a popular
 * club that size draws (see getBaseAttendance), between MIN_STADIUM_CAPACITY and
 * MAX_STADIUM_CAPACITY, rounded to the nearest 500.
 */
export const getStadiumCapacity = (pop: number) =>
	Math.min(
		MAX_STADIUM_CAPACITY,
		Math.max(MIN_STADIUM_CAPACITY, Math.round((8000 + 9000 * pop) / 500) * 500),
	);
