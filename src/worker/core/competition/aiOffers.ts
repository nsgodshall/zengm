import { choice } from "../../../common/random.ts";
import type { Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { player, team } from "../index.ts";
import { ValueChangeCalculator } from "../team/ValueChangeCalculator.ts";
import isUntradable from "../trade/isUntradable.ts";
import { getCurrentTransferWindow, processTransfer } from "./aiTransfers.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import {
	canAffordFee,
	getAiOfferFee,
	getContractSeasonsLeft,
	getTransferFee,
	tickTransferOffers,
	TRANSFER_LISTED_OFFER_WEIGHT,
	TRANSFER_OFFER_DAYS,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// About this many offers are attempted each day for each of the user's clubs,
// scaled by the AI trades setting. A fractional part is a probability.
const OFFER_ATTEMPTS_PER_USER_CLUB = 0.5;

const formatFee = (fee: number) => helpers.formatCurrency(fee / 1000, "M");

const clubName = (tid: number) => {
	const teamInfo = g.get("teamInfoCache")[tid];
	return `${teamInfo?.region} ${teamInfo?.name}`;
};

const getUserPlayers = async () => {
	const players: Player[] = [];
	for (const tid of g.get("userTids")) {
		players.push(...(await idb.cache.players.indexGetAll("playersByTid", tid)));
	}
	return players;
};

/**
 * Why an AI club can't buy one of the user's players for a fee right now, or
 * undefined if it can. The same limits as AI transfers.
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

	const roster = await idb.cache.players.indexGetAll("playersByTid", buyerTid);
	if (roster.length >= g.get("maxRosterSize")) {
		return `The ${name} have no room on their roster`;
	}

	const wageBudget = wageBudgets.get(buyerTid);
	const buyerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[g.get("season"), buyerTid],
	);
	if (wageBudget === undefined || !buyerSeason) {
		return `The ${name} aren't in the league this season`;
	}

	if ((await team.getPayroll(buyerTid)) + p.contract.amount > wageBudget) {
		return `The ${name} can't fit his wages in their budget`;
	}

	if (!canAffordFee({ cash: buyerSeason.cash, fee, wageBudget })) {
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
 * AI clubs try to make up to `numAttempts` offers for the user's players. A
 * club only offers for a player who'd make it better (like AI transfers), that
 * it can afford and fit in its budget and roster, and that it hasn't already
 * made an offer for. Players on the transfer list draw more offers, at lower
 * fees (see getAiOfferFee). Returns how many offers were made.
 */
export const makeAiTransferOffers = async (numAttempts: number) => {
	const season = g.get("season");
	const phase = g.get("phase");
	const userTids = g.get("userTids");

	const aiTids = (await idb.cache.teams.getAll())
		.filter((t) => !t.disabled && !userTids.includes(t.tid))
		.map((t) => t.tid);
	const candidates = (await getUserPlayers()).filter(
		(p) =>
			!isUntradable(p).untradable &&
			getContractSeasonsLeft({ exp: p.contract.exp, season, phase }) > 0,
	);
	if (aiTids.length === 0 || candidates.length === 0) {
		return 0;
	}

	const valueChangeCalculator = new ValueChangeCalculator();
	const wageBudgets = await getWageBudgets();

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
			fee: getTransferFee({
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
			text: `The ${teamLink(buyerTid)} offered ${formatFee(
				fee,
			)} for <a href="${helpers.leagueUrl(["player", p.pid])}">${
				p.firstName
			} ${p.lastName}</a>. <a href="${helpers.leagueUrl([
				"transfer_market",
			])}">Accept or reject the offer</a> within ${TRANSFER_OFFER_DAYS} days.`,
			showNotification: true,
			pids: [p.pid],
			tids: [p.tid],
		});
	}

	if (numOffers > 0) {
		await toUI("realtimeUpdate", [["playerMovement"]]);
	}

	return numOffers;
};

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

	for (const p of await getUserPlayers()) {
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

	const float =
		OFFER_ATTEMPTS_PER_USER_CLUB *
		g.get("aiTradesFactor") *
		g.get("userTids").length;
	let numAttempts = Math.floor(float);
	if (Math.random() < float % 1) {
		numAttempts += 1;
	}

	await makeAiTransferOffers(numAttempts);
};

const getUserPlayer = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (!p || !g.get("userTids").includes(p.tid)) {
		return "Player not found";
	}
	if (g.get("spectator")) {
		return "You can't do that in spectator mode.";
	}
	return p;
};

/**
 * The user sells one of their players to the AI club that made an offer for
 * him. Returns an error message if it can't happen, in which case an offer the
 * club can no longer follow through on is withdrawn.
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

	const untradable = isUntradable(p);
	if (untradable.untradable) {
		return untradable.untradableMsg;
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
	const sellerTid = p.tid;
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

	await processTransfer({
		p,
		buyerTid: tid,
		sellerTid,
		fee: offer.fee,
		buyerSeason,
		sellerSeason,
	});

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
 * Puts one of the user's players on their transfer list, or takes him off it
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
