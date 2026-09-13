import computeDivisionTable from "./computeDivisionTable.ts";
import {
	getDefaultCompetitionStructure,
	getDivisionIdForNewClub,
	getLegacyConfsDivs,
	getNewLeagueCompetition,
	isSingleDivision,
	validateClubDivisions,
	validateCompetitionStructure,
} from "./competitionStructure.ts";
import { buildDivisionTables, getDivisionTables } from "./divisionTables.ts";
import doEndOfSeason from "./endOfSeason.ts";
import planEndOfSeason from "./planEndOfSeason.ts";
import runPromotionPlayoff from "./promotionPlayoff.ts";
import ensureCompetitionStructure, {
	getCompetitionStructure,
} from "./ensureCompetitionStructure.ts";
import {
	getDivisionRounds,
	getRoundRobinRounds,
	mergeRoundsIntoDays,
	newWorldSchedule,
} from "./worldSchedule.ts";
import resolvePromotionRelegation, {
	flattenPromotionRelegationMoves,
	validatePromotionRelegationLink,
} from "./resolvePromotionRelegation.ts";

// International Soccer Zen GM mod: the sport-agnostic competition engine
// (Epic 1-3 of ROADMAP.md). Every league has a competition structure
// (Countries, Divisions, PromotionRelegationLinks) and every team a
// divisionId, set at league creation or filled in on load for older saves.
// Tables and promotion/relegation are pure functions the season/phase rework
// will call once the scheduler (Epic 2) and season flow (Epic 3) produce real
// Division tables to feed them.
export default {
	buildDivisionTables,
	computeDivisionTable,
	doEndOfSeason,
	ensureCompetitionStructure,
	flattenPromotionRelegationMoves,
	getCompetitionStructure,
	getDefaultCompetitionStructure,
	getDivisionIdForNewClub,
	getDivisionRounds,
	getDivisionTables,
	getLegacyConfsDivs,
	getNewLeagueCompetition,
	getRoundRobinRounds,
	isSingleDivision,
	mergeRoundsIntoDays,
	newWorldSchedule,
	planEndOfSeason,
	resolvePromotionRelegation,
	runPromotionPlayoff,
	validateClubDivisions,
	validateCompetitionStructure,
	validatePromotionRelegationLink,
};
