import { choice } from "../../../common/random.ts";
import type { Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { player, team } from "../index.ts";
import { ValueChangeCalculator } from "../team/ValueChangeCalculator.ts";
import isUntradable from "../trade/isUntradable.ts";
import { getAcademyPlayers } from "./academies.ts";
import {
	getAcademyPlayerFee,
	isAcademyPlayerForSale,
	processAcademyTransfer,
} from "./academyTransfers.ts";
import { getCurrentTransferWindow, processTransfer } from "./aiTransfers.ts";
import { acceptLoanRequest, makeAiLoanRequests } from "./loanMoves.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import {
	aiWantsAcademyPlayer,
	canAiAffordFee,
	getAiOfferFee,
	getContractSeasonsLeft,
	getTransferFee,
	tickTransferOffers,
	TRANSFER_LISTED_OFFER_WEIGHT,
	TRANSFER_OFFER_DAYS,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// About this many offers are attempted each day for each of the user's clubs,
// scaled by the AI trades setting, and this many more for the players in its
// academy. A fractional part is a probability.
const OFFER_ATTEMPTS_PER_USER_CLUB = 0.5;
const ACADEMY_OFFER_ATTEMPTS_PER_USER_CLUB = 0.125;

// And about this many requests to borrow the players on the user's loan list
const LOAN_REQUEST_ATTEMPTS_PER_USER_CLUB = 0.25;

const formatFee = (fee: number) => helpers.formatCurrency(fee / 1000, "M");

const clubName = (tid: number) => {
	const teamInfo = g.get("teamInfoCache")[tid];
	return `${teamInfo?.region} ${teamInfo?.name}`;
};

// The club a player is at, in its first team or its academy
const getClubTid = (p: Player) => p.academyTid ?? p.tid;

/** The user's first-team players, or the players in their academies */
const getUserPlayers = async (academy: boolean) => {
	const userTids = g.get("userTids");
	if (academy) {
		return (await getAcademyPlayers()).filter((p) =>
			userTids.includes(p.academyTid!),
		);
	}

	const players: Player[] = [];
	for (const tid of userTids) {
		players.push(...(await idb.cache.players.indexGetAll("playersByTid", tid)));
	}
	return players;
};

/**
 * Why an AI club can't buy one of the user's players for a fee right now, or
 * undefined if it can. The same limits as AI transfers: an academy player
 * would join its academy, so only its cash matters for him.
 */
const getBuyerProblem = async ({
	buyerTid,
	fee,
	p,
	wageBudgets,
}: {
	buyerTid: number;
	fee: number;
	p: Player;
	wageBudgets: Map<number, number>;
}) => {
	const name = clubName(buyerTid);
	const academy = p.academyTid !== undefined;

	if (!academy) {
		const roster = await idb.cache.players.indexGetAll(
			"playersByTid",
			buyerTid,
		);
		if (roster.length >= g.get("maxRosterSize")) {
			return `The ${name} have no room on their roster`;
		}
	}

	const wageBudget = wageBudgets.get(buyerTid);
	const buyerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[g.get("season"), buyerTid],
	);
	if (wageBudget === undefined || !buyerSeason) {
		return `The ${name} aren't in the league this season`;
	}

	if (
		!academy &&
		(await team.getPayroll(buyerTid)) + p.contract.amount > wageBudget
	) {
		return `The ${name} can't fit his wages in their budget`;
	}

	if (!canAiAffordFee({ cash: buyerSeason.cash, fee })) {
		return `The ${name} can't afford the fee`;
	}
};

const removeOffer = (p: Player, tid: number) => {
	const offers = (p.transferOffers ?? []).filter((offer) => offer.tid !== tid);
	if (offers.length > 0) {
		p.transferOffers = offers;
	} else {
		delete p.transferOffers;
	}
};

/**
 * AI clubs try to make up to `numAttempts` offers for the user's first-team
 * players, or with `academy`, the players in the user's academies. A club only
 * offers for a player who'd make it better (like AI transfers, and for an
 * academy player, one who'd be one of the best in its academy), that it can
 * afford and fit in its budget and roster, and that it hasn't already made an
 * offer for. Players on the transfer list draw more offers, at lower fees (see
 * getAiOfferFee). Returns how many offers were made.
 */
export const makeAiTransferOffers = async (
	numAttempts: number,
	academy = false,
) => {
	const season = g.get("season");
	const phase = g.get("phase");
	const userTids = g.get("userTids");

	const aiTids = (await idb.cache.teams.getAll())
		.filter((t) => !t.disabled && !userTids.includes(t.tid))
		.map((t) => t.tid);
	const candidates = (await getUserPlayers(academy)).filter((p) =>
		academy
			? isAcademyPlayerForSale(p)
			: // A player on loan belongs to another club
				p.loan === undefined &&
				!isUntradable(p).untradable &&
				getContractSeasonsLeft({ exp: p.contract.exp, season, phase }) > 0,
	);
	if (aiTids.length === 0 || candidates.length === 0) {
		return 0;
	}

	const valueChangeCalculator = new ValueChangeCalculator();
	const wageBudgets = await getWageBudgets();
	const academyPlayers = academy ? await getAcademyPlayers() : [];

	let numOffers = 0;
	for (let i = 0; i < numAttempts; i++) {
		// Like AI transfers, better players are more likely to be looked at
		const p = choice(
			candidates,
			(p) => p.value * (p.transferListed ? TRANSFER_LISTED_OFFER_WEIGHT : 1),
		);
		const buyerTid = choice(aiTids);
		if (
			!p ||
			buyerTid === undefined ||
			p.transferOffers?.some((offer) => offer.tid === buyerTid)
		) {
			continue;
		}

		const fee = getAiOfferFee({
			fee: academy
				? getAcademyPlayerFee(p)
				: getTransferFee({
						marketWage: player.genContract(p, false).amount,
						age: season - p.born.year,
						seasonsLeft: getContractSeasonsLeft({
							exp: p.contract.exp,
							season,
							phase,
						}),
					}),
			listed: !!p.transferListed,
		});

		if (await getBuyerProblem({ buyerTid, fee, p, wageBudgets })) {
			continue;
		}

		if (academy) {
			const academyValues = academyPlayers
				.filter((p2) => p2.academyTid === buyerTid)
				.map((p2) => p2.value);
			if (!aiWantsAcademyPlayer({ value: p.value, academyValues })) {
				continue;
			}
		} else {
			const buyerValueChange = await valueChangeCalculator.evaluate({
				tid: buyerTid,
				pidsAdd: [p.pid],
				pidsRemove: [],
				dpidsAdd: [],
				dpidsRemove: [],
				tradingPartnerTid: p.tid,
			});
			if (buyerValueChange <= 0) {
				continue;
			}
		}

		p.transferOffers = [
			...(p.transferOffers ?? []),
			{
				tid: buyerTid,
				fee,
				daysLeft: TRANSFER_OFFER_DAYS,
			},
		];
		await idb.cache.players.put(p);
		numOffers += 1;

		await logEvent({
			type: "info",
			text: `The ${teamLink(buyerTid)} offered ${formatFee(fee)} for ${
				academy ? "academy player " : ""
			}<a href="${helpers.leagueUrl(["player", p.pid])}">${
				p.firstName
			} ${p.lastName}</a>. <a href="${helpers.leagueUrl([
				"transfer_market",
			])}">Accept or reject the offer</a> within ${TRANSFER_OFFER_DAYS} days.`,
			showNotification: true,
			pids: [p.pid],
			tids: [getClubTid(p)],
		});
	}

	if (numOffers > 0) {
		await toUI("realtimeUpdate", [["playerMovement"]]);
	}

	return numOffers;
};

// A whole number of attempts, where a fractional part is a probability
const randomRound = (float: number) =>
	Math.floor(float) + (Math.random() < float % 1 ? 1 : 0);

/**
 * International Soccer Zen GM mod (Epic 4): called once a day, alongside AI
 * transfers. While a transfer window is open, offers for the user's players get
 * a day closer to running out and AI clubs make new ones. When no window is
 * open, all offers are withdrawn. No new offers are made while the AI is
 * running the user's clubs (auto play and spectator mode), since then their
 * players are in AI transfers instead.
 */
export const dailyTransferOffers = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const transferWindow = await getCurrentTransferWindow();

	for (const p of [
		...(await getUserPlayers(false)),
		...(await getUserPlayers(true)),
	]) {
		if (p.transferOffers) {
			const offers = transferWindow ? tickTransferOffers(p.transferOffers) : [];
			if (offers.length > 0) {
				p.transferOffers = offers;
			} else {
				delete p.transferOffers;
			}
			await idb.cache.players.put(p);
		}
	}

	if (
		!transferWindow ||
		local.autoPlayUntil ||
		g.get("spectator") ||
		g.get("forceHistoricalRosters")
	) {
		return;
	}

	const numUserClubsFactor = g.get("aiTradesFactor") * g.get("userTids").length;
	await makeAiTransferOffers(
		randomRound(OFFER_ATTEMPTS_PER_USER_CLUB * numUserClubsFactor),
	);
	await makeAiTransferOffers(
		randomRound(ACADEMY_OFFER_ATTEMPTS_PER_USER_CLUB * numUserClubsFactor),
		true,
	);
	await makeAiLoanRequests(
		randomRound(LOAN_REQUEST_ATTEMPTS_PER_USER_CLUB * numUserClubsFactor),
	);
};

const getUserPlayer = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (!p || !g.get("userTids").includes(getClubTid(p))) {
		return "Player not found";
	}
	if (g.get("spectator")) {
		return "You can't do that in spectator mode.";
	}
	return p;
};

/**
 * The user sells one of their players, from their first team or their academy,
 * to the AI club that made an offer for him. Returns an error message if it
 * can't happen, in which case an offer the club can no longer follow through on
 * is withdrawn.
 */
export const acceptAiTransferOffer = async ({
	pid,
	tid,
}: {
	pid: number;
	tid: number;
}) => {
	const p = await getUserPlayer(pid);
	if (typeof p === "string") {
		return p;
	}

	const offer = p.transferOffers?.find((offer) => offer.tid === tid);
	if (!offer) {
		return "That offer isn't open any more.";
	}
	if (!(await getCurrentTransferWindow())) {
		return "The transfer window is closed.";
	}

	if (offer.loan) {
		return acceptLoanRequest(p, tid);
	}

	const academy = p.academyTid !== undefined;
	if (academy) {
		if (!isAcademyPlayerForSale(p)) {
			return `${p.firstName} ${p.lastName} is leaving your academy this summer, so ${helpers.pronoun(
				g.get("gender"),
				"he",
			)} can't be transferred.`;
		}
	} else {
		const untradable = isUntradable(p);
		if (untradable.untradable) {
			return untradable.untradableMsg;
		}
	}

	const problem = await getBuyerProblem({
		buyerTid: tid,
		fee: offer.fee,
		p,
		wageBudgets: await getWageBudgets(),
	});
	if (problem) {
		removeOffer(p, tid);
		await idb.cache.players.put(p);
		await toUI("realtimeUpdate", [["playerMovement"]]);
		return `${problem} any more, so they withdrew their offer.`;
	}

	const season = g.get("season");
	const sellerTid = getClubTid(p);
	const buyerSeason = (await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[season, tid],
	))!;
	const sellerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[season, sellerTid],
	);
	if (!sellerSeason) {
		return "Your club has no season to transfer in.";
	}

	if (academy) {
		await processAcademyTransfer({
			p,
			buyerTid: tid,
			fee: offer.fee,
			buyerSeason,
			sellerSeason,
		});
	} else {
		await processTransfer({
			p,
			buyerTid: tid,
			sellerTid,
			fee: offer.fee,
			buyerSeason,
			sellerSeason,
		});
	}

	await toUI("realtimeUpdate", [["playerMovement"]]);
	await recomputeLocalUITeamOvrs();
};

export const rejectAiTransferOffer = async ({
	pid,
	tid,
}: {
	pid: number;
	tid: number;
}) => {
	const p = await getUserPlayer(pid);
	if (typeof p === "string") {
		return p;
	}

	removeOffer(p, tid);
	await idb.cache.players.put(p);
	await toUI("realtimeUpdate", [["playerMovement"]]);
};

/**
 * Puts one of the user's players, from their first team or their academy, on
 * their transfer list, or takes him off it
 */
export const setTransferListed = async ({
	pid,
	listed,
}: {
	pid: number;
	listed: boolean;
}) => {
	const p = await getUserPlayer(pid);
	if (typeof p === "string") {
		return p;
	}

	if (listed) {
		p.transferListed = true;
	} else {
		delete p.transferListed;
	}
	await idb.cache.players.put(p);
	await toUI("realtimeUpdate", [["playerMovement"]]);
};
