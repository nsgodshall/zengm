import doAcademySummer, {
	ensureAcademies,
	getAcademyClubs,
	getAcademyPlayers,
	promoteAcademyPlayer,
	releaseAcademyPlayer,
	releaseUndecidedGraduates,
} from "./academies.ts";
import computeDivisionTable from "./computeDivisionTable.ts";
import getWorldTables from "./worldTables.ts";
import { makePlayersMostlyLocal } from "./localPlayers.ts";
import { assignStartingSquads } from "./startingSquads.ts";
import setUpNewWorld from "./newWorld.ts";
import { generatePilotWorld } from "./pilotWorld.ts";
import { getWorldNewLeagueInfo } from "./newWorldInfo.ts";
import { getClubDivisionInfo, getLeagueHistory } from "./leagueHistory.ts";
import { getAcademySummary } from "./academySummary.ts";
import { getPlayerTransferInfo } from "./playerTransferInfo.ts";
import getPromotionPlayoffBrackets from "./promotionPlayoffBrackets.ts";
import getScheduleDivisions from "./scheduleDivisions.ts";
import { makeTransferOffer } from "./userTransfers.ts";
import { academyTransfersBetweenAiClubs } from "./academyTransfers.ts";
import {
	canBeLoaned,
	loansBetweenAiClubs,
	processLoan,
	returnLoan,
	returnLoans,
	makeAiLoanRequests,
	requestLoan,
	setLoanListed,
} from "./loanMoves.ts";
import {
	acceptAiTransferOffer,
	dailyTransferOffers,
	makeAiTransferOffers,
	rejectAiTransferOffer,
	setTransferListed,
} from "./aiOffers.ts";
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
import transfersBetweenAiClubs, {
	getCurrentTransferWindow,
} from "./aiTransfers.ts";
import {
	getTransferFee,
	getTransferWindow,
	getWageBudget,
} from "./transferMarket.ts";
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
// Division tables to feed them. A World's economy (Epics 4-5: transfers, wage
// budgets, youth academies) lives here too.
export default {
	buildDivisionTables,
	computeDivisionTable,
	doAcademySummer,
	doEndOfSeason,
	getWorldTables,
	makePlayersMostlyLocal,
	assignStartingSquads,
	setUpNewWorld,
	generatePilotWorld,
	getWorldNewLeagueInfo,
	getClubDivisionInfo,
	getLeagueHistory,
	getAcademySummary,
	getPlayerTransferInfo,
	getPromotionPlayoffBrackets,
	getScheduleDivisions,
	makeTransferOffer,
	academyTransfersBetweenAiClubs,
	canBeLoaned,
	loansBetweenAiClubs,
	processLoan,
	returnLoan,
	returnLoans,
	makeAiLoanRequests,
	requestLoan,
	setLoanListed,
	acceptAiTransferOffer,
	dailyTransferOffers,
	makeAiTransferOffers,
	rejectAiTransferOffer,
	setTransferListed,
	ensureAcademies,
	getAcademyClubs,
	getAcademyPlayers,
	promoteAcademyPlayer,
	releaseAcademyPlayer,
	releaseUndecidedGraduates,
	getCurrentTransferWindow,
	getTransferFee,
	getTransferWindow,
	getWageBudget,
	transfersBetweenAiClubs,
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
