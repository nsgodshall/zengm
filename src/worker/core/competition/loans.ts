import { PHASE } from "../../../common/constants.ts";
import type { Phase } from "../../../common/types.ts";
import type {
	ClubSquadPlan,
	ClubSquadPlayerActionType,
} from "./clubSquadPlan.ts";
import { fillsClubRotationNeed } from "./clubSquadPlan.ts";

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
 * Whether an AI club would lend out one of its first-team players. The summer
 * plan has already protected its rotation and required depth, so only a young
 * player marked for a development loan is available.
 */
export const aiWouldLend = ({
	age,
	plannedAction,
}: {
	age: number;
	plannedAction: ClubSquadPlayerActionType | undefined;
}) => age <= LOAN_MAX_AGE && plannedAction === "loan";

// Decided: academy players can go on loan once they're this old
export const ACADEMY_LOAN_MIN_AGE = 18;

/**
 * Whether an academy player can go on loan now: old enough, and not due to leave
 * the academy before the loan would end. A loan ends in the same summer he
 * graduates, before the academy step, so he goes back to the academy first.
 */
export const canLoanAcademyPlayer = ({
	age,
	graduationSeason,
	loanEndSeason,
}: {
	age: number;
	graduationSeason: number;
	loanEndSeason: number;
}) => age >= ACADEMY_LOAN_MIN_AGE && loanEndSeason <= graduationSeason;

/**
 * Whether an AI club would lend out one of its academy players: only one who
 * isn't ready for its first team, since a club promotes a player who'd already
 * be in its rotation (see planAcademyPromotions). `rosterValuesNoPot` is its
 * first team.
 */
export const aiWouldLendAcademyPlayer = ({
	valueNoPot,
	squadPlan,
}: {
	valueNoPot: number;
	squadPlan: ClubSquadPlan;
}) => {
	if (squadPlan.rosterSize < squadPlan.rotationSize) {
		return false;
	}
	const cutoff = squadPlan.rosterValues[squadPlan.rotationSize - 1];
	return cutoff !== undefined && valueNoPot < cutoff;
};

/**
 * Whether an AI club would borrow a player: only if he'd be in its rotation,
 * so he'd get minutes. `rosterValuesNoPot` doesn't include him.
 */
export const aiWouldBorrow = ({
	valueNoPot,
	squadPlan,
}: {
	valueNoPot: number;
	squadPlan: ClubSquadPlan;
}) => fillsClubRotationNeed({ plan: squadPlan, playerValue: valueNoPot });
