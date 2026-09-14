import { PHASE } from "../../../common/constants.ts";
import { choice } from "../../../common/random.ts";
import type { Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent } from "../../util/index.ts";
import { player, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { getNumPlayersTradedAwayNormalizedAll } from "../player/getNumPlayersTradedAwayNormalized.ts";
import { dropPlayers } from "../team/checkRosterSizes.ts";
import isUntradable from "../trade/isUntradable.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	aiWouldBorrow,
	aiWouldLend,
	getLoanEndSeason,
	LOAN_MAX_AGE,
} from "./loans.ts";
import teamLink from "./teamLink.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// International Soccer Zen GM mod (Epic 4, stage D): moving players on and off
// loan (see competition/loans.ts)

const playerLink = (p: Player) =>
	`<a href="${helpers.leagueUrl(["player", p.pid])}">${p.firstName} ${p.lastName}</a>`;

// Like ZenGM trades, the user's rosters are only sorted if they asked for it
const sortRosters = async (tids: number[]) => {
	for (const tid of tids) {
		const t = await idb.cache.teams.get(tid);
		if (!g.get("userTids").includes(tid) || t?.keepRosterSorted) {
			await team.rosterAutoSort(tid);
		}
	}
};

const setJerseyNumber = async (p: Player, tid: number) => {
	if (g.get("phase") <= PHASE.PLAYOFFS) {
		player.setJerseyNumber(
			p,
			await player.genJerseyNumber(
				p,
				await getTeammateJerseyNumbers(tid, [p.pid]),
			),
		);
	}
};

/**
 * Whether a first-team player can go on loan now: not on loan already, not
 * just signed or transferred, and with a contract that lasts until the loan
 * would end
 */
export const canBeLoaned = (p: Player) =>
	p.tid >= 0 &&
	p.loan === undefined &&
	!isUntradable(p).untradable &&
	p.contract.exp >=
		getLoanEndSeason({ season: g.get("season"), phase: g.get("phase") });

/**
 * Loans a player to `borrowerTid` until the summer (see getLoanEndSeason). The
 * borrower plays him and pays his wages.
 */
export const processLoan = async (p: Player, borrowerTid: number) => {
	const season = g.get("season");
	const phase = g.get("phase");
	const lenderTid = p.tid;
	const endSeason = getLoanEndSeason({ season, phase });

	p.loan = { tid: lenderTid, season: endSeason };
	p.tid = borrowerTid;
	p.ptModifier = 1;
	delete p.transferOffers;
	delete p.transferListed;
	await setJerseyNumber(p, borrowerTid);

	const eid = await logEvent({
		type: "loan",
		text: `The ${teamLink(borrowerTid)} borrowed ${playerLink(p)} from the ${teamLink(lenderTid)} until the end of the ${endSeason} season.`,
		showNotification: false,
		pids: [p.pid],
		tids: [borrowerTid, lenderTid],
		score: 0,
	});

	p.transactions ??= [];
	p.transactions.push({
		season,
		phase,
		tid: borrowerTid,
		type: "loan",
		fromTid: lenderTid,
		eid,
	});
	await idb.cache.players.put(p);

	await sortRosters([borrowerTid, lenderTid]);
};

/**
 * Sends a player on loan back to his club, when his loan ends or early. If his
 * club is gone, he becomes a free agent.
 */
export const returnLoan = async (p: Player) => {
	if (!p.loan) {
		return;
	}

	const borrowerTid = p.tid;
	const lenderTid = p.loan.tid;
	delete p.loan;
	p.ptModifier = 1;

	const lender = await idb.cache.teams.get(lenderTid);
	if (!lender || lender.disabled) {
		player.addToFreeAgents(p, await getNumPlayersTradedAwayNormalizedAll());
		await idb.cache.players.put(p);
		return;
	}

	p.tid = lenderTid;
	await setJerseyNumber(p, lenderTid);

	const eid = await logEvent({
		type: "loan",
		text: `${playerLink(p)} went back to the ${teamLink(lenderTid)} from a loan at the ${teamLink(borrowerTid)}.`,
		showNotification: false,
		pids: [p.pid],
		tids: [lenderTid, borrowerTid],
		score: 0,
	});

	p.transactions ??= [];
	p.transactions.push({
		season: g.get("season"),
		phase: g.get("phase"),
		tid: lenderTid,
		type: "loanReturn",
		fromTid: borrowerTid,
		eid,
	});
	await idb.cache.players.put(p);

	await sortRosters([lenderTid, borrowerTid]);
};

/**
 * In a World's draft phase, before re-signing starts, players whose loans end
 * this season go back to their clubs. Like after academy promotions, an AI club
 * that goes over the roster limit releases its lowest value players straight
 * away, so it isn't shut out of the transfer market all summer.
 */
export const returnLoans = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const season = g.get("season");
	const loaned = (
		await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
	).filter((p) => p.loan !== undefined && p.loan.season <= season);

	const lenderTids = new Set<number>();
	for (const p of loaned) {
		lenderTids.add(p.loan!.tid);
		await returnLoan(p);
	}

	const aiRunsUserClubs = !!local.autoPlayUntil || g.get("spectator");
	for (const tid of lenderTids) {
		if (g.get("userTids").includes(tid) && !aiRunsUserClubs) {
			continue;
		}

		const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
		const numOver = roster.length - g.get("maxRosterSize");
		if (numOver > 0) {
			await dropPlayers(roster, numOver);
		}
	}
};

/**
 * AI clubs (`aiTids`) try up to `numAttempts` times to borrow young players from
 * each other, who aren't getting minutes at their clubs but would at the
 * borrower (see aiWouldLend and aiWouldBorrow), if the borrower has room on its
 * roster and in its wage budget. Returns how many loans were made.
 */
export const loansBetweenAiClubs = async (
	numAttempts: number,
	aiTids: number[],
) => {
	if (numAttempts <= 0 || aiTids.length < 2) {
		return 0;
	}

	const season = g.get("season");
	const rotationSize = 2 * g.get("numPlayersOnCourt");
	const wageBudgets = await getWageBudgets();

	let numLoans = 0;
	for (let i = 0; i < numAttempts; i++) {
		const borrowerTid = choice(aiTids);
		if (borrowerTid === undefined) {
			continue;
		}
		const borrowerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			borrowerTid,
		);
		if (borrowerRoster.length >= g.get("maxRosterSize")) {
			continue;
		}

		const candidates: Player[] = [];
		for (const tid of aiTids) {
			if (tid !== borrowerTid) {
				for (const p of await idb.cache.players.indexGetAll(
					"playersByTid",
					tid,
				)) {
					if (season - p.born.year <= LOAN_MAX_AGE && canBeLoaned(p)) {
						candidates.push(p);
					}
				}
			}
		}

		// Like AI transfers, better players are more likely to be looked at
		const p = choice(candidates, (p) => p.value);
		if (!p) {
			continue;
		}

		const lenderRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			p.tid,
		);
		if (
			!aiWouldLend({
				age: season - p.born.year,
				valueNoPot: p.valueNoPot,
				rosterValuesNoPot: lenderRoster.map((p2) => p2.valueNoPot),
				rotationSize,
				minRosterSize: g.get("minRosterSize"),
			}) ||
			!aiWouldBorrow({
				valueNoPot: p.valueNoPot,
				rosterValuesNoPot: borrowerRoster.map((p2) => p2.valueNoPot),
				rotationSize,
			})
		) {
			continue;
		}

		const wageBudget = wageBudgets.get(borrowerTid);
		if (
			wageBudget === undefined ||
			(await team.getPayroll(borrowerTid)) + p.contract.amount > wageBudget
		) {
			continue;
		}

		await processLoan(p, borrowerTid);
		numLoans += 1;
	}

	return numLoans;
};
