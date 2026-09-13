import { PHASE } from "../../../common/constants.ts";
import { choice } from "../../../common/random.ts";
import type { Player, TeamSeason } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { player, season, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { ValueChangeCalculator } from "../team/ValueChangeCalculator.ts";
import isUntradable from "../trade/isUntradable.ts";
import {
	getSeasonProgress,
	getTransferFee,
	getTransferWindow,
	getWageBudget,
} from "./transferMarket.ts";

// The buying club's value change (same scale as AI trades) has to be above
// this, so it only buys players who make it better
const BUYER_MIN_VALUE_CHANGE = 0;

// The selling club's value change can't be below this, so it only sells
// players it can do without. The fee isn't part of this: AI clubs don't sell
// stars just because the price is right.
const SELLER_MAX_VALUE_LOSS = -5;

// A club can spend into debt, down to this fraction of its wage budget
const MAX_DEBT_FRACTION_OF_WAGE_BUDGET = 0.5;

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
 * Every active club's wage budget, from its revenue in the last completed
 * season (see getWageBudget).
 */
const getWageBudgets = async () => {
	const currentSeason = g.get("season");
	const revenueSeason =
		g.get("phase") > PHASE.PLAYOFFS ? currentSeason : currentSeason - 1;

	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[revenueSeason], [revenueSeason, "Z"]],
	);
	const revenueByTid = new Map<number, number>();
	for (const teamSeason of teamSeasons) {
		let revenue = 0;
		for (const amount of Object.values(teamSeason.revenues)) {
			revenue += amount;
		}
		revenueByTid.set(teamSeason.tid, revenue);
	}
	const averageRevenue =
		revenueByTid.size > 0
			? [...revenueByTid.values()].reduce((sum, x) => sum + x, 0) /
				revenueByTid.size
			: 0;

	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	const popRanks = helpers.getPopRanks(teams);

	const wageBudgets = new Map<number, number>();
	for (const [i, t] of teams.entries()) {
		wageBudgets.set(
			t.tid,
			getWageBudget({
				salaryCap: g.get("salaryCap"),
				revenue: revenueByTid.get(t.tid),
				averageRevenue,
				popRank: popRanks[i] ?? teams.length,
				numTeams: teams.length,
			}),
		);
	}

	return wageBudgets;
};

const teamLink = (tid: number) => {
	const teamInfo = g.get("teamInfoCache")[tid];
	return `<a href="${helpers.leagueUrl([
		"roster",
		`${teamInfo?.abbrev}_${tid}`,
		g.get("season"),
	])}">${teamInfo?.region} ${teamInfo?.name}</a>`;
};

const processTransfer = async ({
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

	buyerSeason.cash -= fee;
	sellerSeason.cash += fee;
	await idb.cache.teamSeasons.putAll([buyerSeason, sellerSeason]);

	const eid = await logEvent({
		type: "transfer",
		text: `The ${teamLink(buyerTid)} bought <a href="${helpers.leagueUrl([
			"player",
			p.pid,
		])}">${p.firstName} ${p.lastName}</a> from the ${teamLink(sellerTid)} for ${
			fee > 0 ? helpers.formatCurrency(fee / 1000, "M") : "free"
		}.`,
		showNotification: false,
		pids: [p.pid],
		tids: [buyerTid, sellerTid],
		score: Math.round(helpers.bound(p.valueFuzz - 40, 0, Infinity)),
	});

	p.transactions ??= [];
	p.transactions.push({
		season: g.get("season"),
		phase: g.get("phase"),
		tid: buyerTid,
		type: "transfer",
		fromTid: sellerTid,
		fee,
		eid,
	});
	await idb.cache.players.put(p);

	await team.rosterAutoSort(buyerTid);
	await team.rosterAutoSort(sellerTid);
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
	const seasonsLeft =
		p.contract.exp - currentSeason + (g.get("phase") <= PHASE.PLAYOFFS ? 1 : 0);
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

	if (buyerSeason.cash - fee < -MAX_DEBT_FRACTION_OF_WAGE_BUDGET * wageBudget) {
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
	// the same AI trades setting. A fractional part is a probability.
	const float = (g.get("aiTradesFactor") * g.get("numActiveTeams")) / 10;
	let numAttempts = Math.floor(float);
	if (Math.random() < float % 1) {
		numAttempts += 1;
	}
	if (numAttempts === 0) {
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

	if (anyTransfers) {
		await toUI("realtimeUpdate", [["playerMovement"]]);
		await recomputeLocalUITeamOvrs();
	}
};

export default transfersBetweenAiClubs;
