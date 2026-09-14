import { PHASE } from "../../../common/constants.ts";
import type { Phase } from "../../../common/types.ts";

// International Soccer Zen GM mod (Epic 4, stage D): season-long loans. A player
// on loan plays for, and is paid by, the club he's loaned to, and goes back to
// his own club in the summer, before re-signing starts.

// AI clubs only lend out players this old or younger
export const LOAN_MAX_AGE = 23;

/**
 * The season a loan made now ends, in whose draft phase the player goes back:
 * this season's for a loan made before the playoffs are over, otherwise next
 * season's
 */
export const getLoanEndSeason = ({
	season,
	phase,
}: {
	season: number;
	phase: Phase;
}) => (phase <= PHASE.PLAYOFFS ? season : season + 1);

/**
 * The value on current ability (valueNoPot) a player needs to be in a club's
 * rotation, its best `rotationSize` players. Undefined if it has fewer players
 * than that, so everyone is.
 */
const getRotationCutoff = (valuesNoPot: number[], rotationSize: number) => {
	const sorted = [...valuesNoPot].sort((a, b) => b - a);
	return sorted.length < rotationSize ? undefined : sorted[rotationSize - 1];
};

/**
 * Whether an AI club would lend out one of its players: a young one who isn't
 * getting minutes, because he's outside its rotation, as long as it keeps more
 * than `minRosterSize` players. `rosterValuesNoPot` includes the player.
 */
export const aiWouldLend = ({
	age,
	valueNoPot,
	rosterValuesNoPot,
	rotationSize,
	minRosterSize,
}: {
	age: number;
	valueNoPot: number;
	rosterValuesNoPot: number[];
	rotationSize: number;
	minRosterSize: number;
}) => {
	if (age > LOAN_MAX_AGE || rosterValuesNoPot.length <= minRosterSize) {
		return false;
	}

	const cutoff = getRotationCutoff(rosterValuesNoPot, rotationSize);
	return cutoff !== undefined && valueNoPot < cutoff;
};

/**
 * Whether an AI club would borrow a player: only if he'd be in its rotation,
 * so he'd get minutes. `rosterValuesNoPot` doesn't include him.
 */
export const aiWouldBorrow = ({
	valueNoPot,
	rosterValuesNoPot,
	rotationSize,
}: {
	valueNoPot: number;
	rosterValuesNoPot: number[];
	rotationSize: number;
}) => {
	const cutoff = getRotationCutoff(rosterValuesNoPot, rotationSize);
	return cutoff === undefined || valueNoPot > cutoff;
};
