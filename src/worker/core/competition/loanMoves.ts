import { PHASE } from "../../../common/constants.ts";
import { choice } from "../../../common/random.ts";
import type { Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
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
import { getCurrentTransferWindow } from "./aiTransfers.ts";
import teamLink from "./teamLink.ts";
import { TRANSFER_OFFER_DAYS } from "./transferMarket.ts";
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
	delete p.loanListed;
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

const formatAmount = (amount: number) =>
	helpers.formatCurrency(amount / 1000, "M");

const clubName = (tid: number) => {
	const teamInfo = g.get("teamInfoCache")[tid];
	return `${teamInfo?.region} ${teamInfo?.name}`;
};

/**
 * Why an AI club can't borrow a player right now, or undefined if it can: it
 * needs room on its roster and in its wage budget, since it pays his wages
 */
const getBorrowerProblem = async (
	p: Player,
	borrowerTid: number,
	wageBudgets: Map<number, number>,
) => {
	const name = clubName(borrowerTid);

	const roster = await idb.cache.players.indexGetAll(
		"playersByTid",
		borrowerTid,
	);
	if (roster.length >= g.get("maxRosterSize")) {
		return `The ${name} have no room on their roster`;
	}

	const wageBudget = wageBudgets.get(borrowerTid);
	if (wageBudget === undefined) {
		return `The ${name} aren't in the league this season`;
	}
	if ((await team.getPayroll(borrowerTid)) + p.contract.amount > wageBudget) {
		return `The ${name} can't fit his wages in their budget`;
	}
};

export type LoanRequestResult = {
	type: "accept" | "error" | "reject";
	message: string;
};

/**
 * The user asks an AI club to borrow one of its first-team players until the
 * summer. The club agrees only if it would lend him to another AI club (see
 * aiWouldLend), and the user needs room on their roster and in their wage
 * budget, since they pay his wages.
 */
export const requestLoan = async ({
	pid,
}: {
	pid: number;
}): Promise<LoanRequestResult> => {
	const error = (message: string) => ({ type: "error" as const, message });

	if (isSingleDivision(getCompetitionStructure())) {
		return error("Loans only happen in a World.");
	}
	if (g.get("spectator")) {
		return error("You can't borrow players in spectator mode.");
	}
	if (!(await getCurrentTransferWindow())) {
		return error("The transfer window is closed.");
	}

	const userTid = g.get("userTid");
	const p = await idb.cache.players.get(pid);
	if (!p || p.tid < 0) {
		return error("That player isn't on a club's first team.");
	}
	if (g.get("userTids").includes(p.tid)) {
		return error("That player is already yours.");
	}

	const name = `${p.firstName} ${p.lastName}`;
	const he = helpers.pronoun(g.get("gender"), "he");
	const lenderName = clubName(p.tid);
	const season = g.get("season");
	const endSeason = getLoanEndSeason({ season, phase: g.get("phase") });

	if (p.loan) {
		return error(`${name} is already on loan.`);
	}
	const untradable = isUntradable(p);
	if (untradable.untradable) {
		return error(untradable.untradableMsg);
	}
	if (p.contract.exp < endSeason) {
		return error(
			`${name}'s contract ends before a loan would, at the end of the ${endSeason} season.`,
		);
	}

	const userRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		userTid,
	);
	if (userRoster.length >= g.get("maxRosterSize")) {
		return error("Your roster is full. Release a player before borrowing one.");
	}

	const wageBudget = (await getWageBudgets()).get(userTid);
	if (wageBudget === undefined) {
		return error("Your club has no wage budget this season.");
	}
	if ((await team.getPayroll(userTid)) + p.contract.amount > wageBudget) {
		return error(
			`Your board won't let ${name}'s wages of ${formatAmount(
				p.contract.amount,
			)} take your payroll over your wage budget of ${formatAmount(wageBudget)}.`,
		);
	}

	const age = season - p.born.year;
	const lenderRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		p.tid,
	);
	if (
		!aiWouldLend({
			age,
			valueNoPot: p.valueNoPot,
			rosterValuesNoPot: lenderRoster.map((p2) => p2.valueNoPot),
			rotationSize: 2 * g.get("numPlayersOnCourt"),
			minRosterSize: g.get("minRosterSize"),
		})
	) {
		return {
			type: "reject",
			message:
				age > LOAN_MAX_AGE
					? `The ${lenderName} only loan out players ${LOAN_MAX_AGE} or younger.`
					: `The ${lenderName} won't loan out ${name}, since ${he}'s in their rotation or they're short of players.`,
		};
	}

	await processLoan(p, userTid);
	await toUI("realtimeUpdate", [["playerMovement"]]);
	await recomputeLocalUITeamOvrs();

	return {
		type: "accept",
		message: `The ${lenderName} loaned you ${name} until the end of the ${endSeason} season.`,
	};
};

/**
 * AI clubs try up to `numAttempts` times to ask to borrow players the user has
 * put on their loan list. A request is an offer with no fee and `loan` set,
 * which stays open like a transfer offer (see aiOffers.ts). A club only asks
 * for a player who'd be in its rotation, with room on its roster and in its
 * wage budget. Returns how many requests were made.
 */
export const makeAiLoanRequests = async (numAttempts: number) => {
	const userTids = g.get("userTids");

	const candidates: Player[] = [];
	for (const tid of userTids) {
		for (const p of await idb.cache.players.indexGetAll("playersByTid", tid)) {
			if (p.loanListed && canBeLoaned(p)) {
				candidates.push(p);
			}
		}
	}
	const aiTids = (await idb.cache.teams.getAll())
		.filter((t) => !t.disabled && !userTids.includes(t.tid))
		.map((t) => t.tid);
	if (numAttempts <= 0 || candidates.length === 0 || aiTids.length === 0) {
		return 0;
	}

	const rotationSize = 2 * g.get("numPlayersOnCourt");
	const wageBudgets = await getWageBudgets();
	const endSeason = getLoanEndSeason({
		season: g.get("season"),
		phase: g.get("phase"),
	});

	let numRequests = 0;
	for (let i = 0; i < numAttempts; i++) {
		const p = choice(candidates, (p) => p.value);
		const borrowerTid = choice(aiTids);
		if (
			!p ||
			borrowerTid === undefined ||
			p.transferOffers?.some((offer) => offer.tid === borrowerTid) ||
			(await getBorrowerProblem(p, borrowerTid, wageBudgets))
		) {
			continue;
		}

		const borrowerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			borrowerTid,
		);
		if (
			!aiWouldBorrow({
				valueNoPot: p.valueNoPot,
				rosterValuesNoPot: borrowerRoster.map((p2) => p2.valueNoPot),
				rotationSize,
			})
		) {
			continue;
		}

		p.transferOffers = [
			...(p.transferOffers ?? []),
			{
				tid: borrowerTid,
				fee: 0,
				daysLeft: TRANSFER_OFFER_DAYS,
				loan: true,
			},
		];
		await idb.cache.players.put(p);
		numRequests += 1;

		await logEvent({
			type: "info",
			text: `The ${teamLink(borrowerTid)} asked to borrow ${playerLink(p)} until the end of the ${endSeason} season. <a href="${helpers.leagueUrl(
				["transfer_market"],
			)}">Accept or reject the request</a> within ${TRANSFER_OFFER_DAYS} days.`,
			showNotification: true,
			pids: [p.pid],
			tids: [p.tid],
		});
	}

	if (numRequests > 0) {
		await toUI("realtimeUpdate", [["playerMovement"]]);
	}

	return numRequests;
};

/**
 * The user loans one of their players to the AI club that asked to borrow him
 * (see acceptAiTransferOffer). Returns an error message if it can't happen, in
 * which case a request the club can no longer follow through on is withdrawn.
 */
export const acceptLoanRequest = async (p: Player, borrowerTid: number) => {
	const untradable = isUntradable(p);
	if (untradable.untradable) {
		return untradable.untradableMsg;
	}
	if (!canBeLoaned(p)) {
		return `${p.firstName} ${p.lastName} can't go on loan, since his contract ends before the loan would.`;
	}

	const problem = await getBorrowerProblem(
		p,
		borrowerTid,
		await getWageBudgets(),
	);
	if (problem) {
		const offers = (p.transferOffers ?? []).filter(
			(offer) => offer.tid !== borrowerTid,
		);
		if (offers.length > 0) {
			p.transferOffers = offers;
		} else {
			delete p.transferOffers;
		}
		await idb.cache.players.put(p);
		await toUI("realtimeUpdate", [["playerMovement"]]);
		return `${problem} any more, so they withdrew their request.`;
	}

	await processLoan(p, borrowerTid);
	await toUI("realtimeUpdate", [["playerMovement"]]);
	await recomputeLocalUITeamOvrs();
};

/**
 * Puts one of the user's first-team players on their loan list, for AI clubs
 * to ask to borrow him, or takes him off it
 */
export const setLoanListed = async ({
	pid,
	listed,
}: {
	pid: number;
	listed: boolean;
}) => {
	const p = await idb.cache.players.get(pid);
	if (!p || !g.get("userTids").includes(p.tid)) {
		return "Player not found";
	}
	if (g.get("spectator")) {
		return "You can't do that in spectator mode.";
	}
	if (p.loan) {
		return "A player on loan from another club can't be loaned out.";
	}

	if (listed) {
		p.loanListed = true;
	} else {
		delete p.loanListed;
	}
	await idb.cache.players.put(p);
	await toUI("realtimeUpdate", [["playerMovement"]]);
};
