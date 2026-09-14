import { PHASE } from "../../../common/constants.ts";
import { choice } from "../../../common/random.ts";
import type { Player, TeamSeason } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, local, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { player, season, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { ValueChangeCalculator } from "../team/ValueChangeCalculator.ts";
import isUntradable from "../trade/isUntradable.ts";
import { academyTransfersBetweenAiClubs } from "./academyTransfers.ts";
import { recordTransfer } from "./recordTransfer.ts";
import {
	canAffordFee,
	getContractSeasonsLeft,
	getSeasonProgress,
	getTransferFee,
	getTransferWindow,
	SELLER_MAX_VALUE_LOSS,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// The buying club's value change (same scale as AI trades) has to be above
// this, so it only buys players who make it better
const BUYER_MIN_VALUE_CHANGE = 0;

/**
 * The transfer window open right now in the current league, if any (see
 * getTransferWindow).
 */
export const getCurrentTransferWindow = async () => {
	const phase = g.get("phase");

	let seasonProgress = 0;
	if (phase === PHASE.REGULAR_SEASON) {
		const schedule = await season.getSchedule();
		const today = schedule[0]?.day;
		const lastDay = schedule.at(-1)?.day;
		seasonProgress =
			today !== undefined && lastDay !== undefined
				? getSeasonProgress(today, lastDay)
				: 1;
	}

	return getTransferWindow({
		phase,
		seasonProgress,
		tradeDeadline: g.get("tradeDeadline"),
	});
};

// Same as AI trades: the user's clubs only take part when the AI is running
// them (auto play or spectator mode)
const getAITids = async () => {
	const teams = await idb.cache.teams.getAll();
	return teams
		.filter((t) => {
			if (t.disabled) {
				return false;
			}
			if (
				(local.autoPlayUntil || g.get("spectator")) &&
				!g.get("challengeNoTrades")
			) {
				return true;
			}
			return !g.get("userTids").includes(t.tid);
		})
		.map((t) => t.tid);
};

/**
 * Moves a player to the buying club, which pays the fee (thousands of dollars)
 * to the selling club. He keeps his contract.
 */
export const processTransfer = async ({
	p,
	buyerTid,
	sellerTid,
	fee,
	buyerSeason,
	sellerSeason,
}: {
	p: Player;
	buyerTid: number;
	sellerTid: number;
	fee: number;
	buyerSeason: TeamSeason;
	sellerSeason: TeamSeason;
}) => {
	p.tid = buyerTid;
	p.ptModifier = 1;
	delete p.transferOffers;
	delete p.transferListed;

	// Like a newly signed player, so he isn't sold on again straight away
	p.gamesUntilTradable = Math.round(0.17 * g.get("numGames"));

	if (g.get("phase") <= PHASE.PLAYOFFS) {
		player.setJerseyNumber(
			p,
			await player.genJerseyNumber(
				p,
				await getTeammateJerseyNumbers(buyerTid, [p.pid]),
			),
		);
	}

	await recordTransfer({
		p,
		buyerTid,
		sellerTid,
		fee,
		buyerSeason,
		sellerSeason,
	});
	await idb.cache.players.put(p);

	// Like ZenGM trades, the user's rosters are only sorted if they asked for it
	for (const tid of [buyerTid, sellerTid]) {
		const t = await idb.cache.teams.get(tid);
		if (!g.get("userTids").includes(tid) || t?.keepRosterSorted) {
			await team.rosterAutoSort(tid);
		}
	}
};

/**
 * One AI club tries to buy one player from another AI club. Returns the two
 * tids if a transfer happened.
 */
const attempt = async (
	valueChangeCalculator: ValueChangeCalculator,
	wageBudgets: Map<number, number>,
) => {
	const aiTids = await getAITids();
	if (aiTids.length < 2) {
		return;
	}

	const buyerTid = choice(aiTids);
	const buyerRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		buyerTid,
	);
	if (buyerRoster.length >= g.get("maxRosterSize")) {
		return;
	}

	const candidates: Player[] = [];
	for (const tid of aiTids) {
		if (tid !== buyerTid) {
			for (const p of await idb.cache.players.indexGetAll(
				"playersByTid",
				tid,
			)) {
				if (!isUntradable(p).untradable) {
					candidates.push(p);
				}
			}
		}
	}

	// Like AI trades, better players are more likely to be looked at
	const p = choice(candidates, (p) => p.value);
	if (!p) {
		return;
	}
	const sellerTid = p.tid;

	const currentSeason = g.get("season");
	const seasonsLeft = getContractSeasonsLeft({
		exp: p.contract.exp,
		season: currentSeason,
		phase: g.get("phase"),
	});
	if (seasonsLeft <= 0) {
		return;
	}

	const fee = getTransferFee({
		marketWage: player.genContract(p, false).amount,
		age: currentSeason - p.born.year,
		seasonsLeft,
	});

	const buyerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[currentSeason, buyerTid],
	);
	const sellerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[currentSeason, sellerTid],
	);
	const wageBudget = wageBudgets.get(buyerTid);
	if (!buyerSeason || !sellerSeason || wageBudget === undefined) {
		return;
	}

	if (!canAffordFee({ cash: buyerSeason.cash, fee, wageBudget })) {
		return;
	}

	const payroll = await team.getPayroll(buyerTid);
	if (payroll + p.contract.amount > wageBudget) {
		return;
	}

	const sellerRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		sellerTid,
	);
	if (sellerRoster.length <= g.get("minRosterSize")) {
		return;
	}

	const buyerValueChange = await valueChangeCalculator.evaluate({
		tid: buyerTid,
		pidsAdd: [p.pid],
		pidsRemove: [],
		dpidsAdd: [],
		dpidsRemove: [],
		tradingPartnerTid: sellerTid,
	});
	if (buyerValueChange <= BUYER_MIN_VALUE_CHANGE) {
		return;
	}

	const sellerValueChange = await valueChangeCalculator.evaluate({
		tid: sellerTid,
		pidsAdd: [],
		pidsRemove: [p.pid],
		dpidsAdd: [],
		dpidsRemove: [],
		tradingPartnerTid: buyerTid,
	});
	if (sellerValueChange < SELLER_MAX_VALUE_LOSS) {
		return;
	}

	await processTransfer({
		p,
		buyerTid,
		sellerTid,
		fee,
		buyerSeason,
		sellerSeason,
	});

	return [buyerTid, sellerTid] as [number, number];
};

// A whole number of attempts, where a fractional part is a probability
const randomRound = (float: number) =>
	Math.floor(float) + (Math.random() < float % 1 ? 1 : 0);

/**
 * International Soccer Zen GM mod (Epic 4): AI clubs in a World buy and sell
 * players for fees, but only while a transfer window is open. Called once a
 * day wherever ZenGM does AI trades, in their place.
 */
const transfersBetweenAiClubs = async () => {
	if (g.get("forceHistoricalRosters") || !(await getCurrentTransferWindow())) {
		return;
	}

	// Transfers are the main way clubs change rosters, so there are more
	// attempts than AI trades get: about 1 for every 10 clubs a day, scaled by
	// the same AI trades setting. Academy players change hands less often, with
	// about 1 attempt for every 40 clubs a day.
	const numClubsFactor = g.get("aiTradesFactor") * g.get("numActiveTeams");
	const numAttempts = randomRound(numClubsFactor / 10);
	const numAcademyAttempts = randomRound(numClubsFactor / 40);
	if (numAttempts === 0 && numAcademyAttempts === 0) {
		return;
	}

	const valueChangeCalculator = new ValueChangeCalculator();
	const wageBudgets = await getWageBudgets();

	let anyTransfers = false;
	for (let i = 0; i < numAttempts; i++) {
		const tids = await attempt(valueChangeCalculator, wageBudgets);
		if (tids) {
			anyTransfers = true;
			valueChangeCalculator.invalidateCache({ teams: tids });
		}
	}

	const numAcademyTransfers = await academyTransfersBetweenAiClubs(
		numAcademyAttempts,
		await getAITids(),
	);

	if (anyTransfers || numAcademyTransfers > 0) {
		await toUI("realtimeUpdate", [["playerMovement"]]);
		await recomputeLocalUITeamOvrs();
	}
};

export default transfersBetweenAiClubs;
