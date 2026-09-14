import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, toUI } from "../../util/index.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { player, season, team } from "../index.ts";
import { ValueChangeCalculator } from "../team/ValueChangeCalculator.ts";
import isUntradable from "../trade/isUntradable.ts";
import {
	getAcademyPlayerAskingPrice,
	isAcademyPlayerForSale,
	processAcademyTransfer,
} from "./academyTransfers.ts";
import { getCurrentTransferWindow, processTransfer } from "./aiTransfers.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	canAffordFee,
	getAskingPrice,
	getContractSeasonsLeft,
	getTransferFee,
	respondToTransferOffer,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// The day each player last got an offer from the user below his asking price.
// A club only hears the user out once a day about each player, but the asking
// price can always be paid.
const lastLowOfferDayByPid = new Map<number, string>();

const getDayKey = async () => {
	const phase = g.get("phase");
	const day =
		phase === PHASE.REGULAR_SEASON
			? (await season.getSchedule())[0]?.day
			: g.get("daysLeft");
	return `${g.get("season")}:${phase}:${day}`;
};

const formatFee = (fee: number) => helpers.formatCurrency(fee / 1000, "M");

export type TransferOfferResult =
	| {
			type: "accept" | "error" | "reject";
			message: string;
	  }
	| {
			type: "counter";
			message: string;
			// Thousands of dollars
			askingPrice: number;
	  };

/**
 * International Soccer Zen GM mod (Epic 4): the user offers a fee, in thousands
 * of dollars, for a player at an AI club, in its first team or its academy. The
 * club accepts its asking price or more (see getAskingPrice and
 * getAcademyPlayerAskingPrice), counters with its asking price when the offer is
 * close, and rejects the rest. A first-team player keeps his contract, and the
 * same roster, wage budget, and debt limits apply as for AI clubs. An academy
 * player joins the user's academy, so only the debt limit applies.
 */
export const makeTransferOffer = async ({
	pid,
	fee,
}: {
	pid: number;
	fee: number;
}): Promise<TransferOfferResult> => {
	const error = (message: string) => ({ type: "error" as const, message });

	if (isSingleDivision(getCompetitionStructure())) {
		return error("Transfers only happen in a World.");
	}
	if (g.get("spectator")) {
		return error("You can't make offers in spectator mode.");
	}
	if (!(await getCurrentTransferWindow())) {
		return error("The transfer window is closed.");
	}
	if (!Number.isFinite(fee) || fee < 0) {
		return error("Offer a fee of $0 or more.");
	}

	const userTid = g.get("userTid");
	const p = await idb.cache.players.get(pid);
	const sellerTid = p?.academyTid ?? p?.tid;
	if (!p || sellerTid === undefined || sellerTid < 0) {
		return error("That player isn't at a club.");
	}
	if (g.get("userTids").includes(sellerTid)) {
		return error("That player is already yours.");
	}

	const inAcademy = p.academyTid !== undefined;
	const name = `${p.firstName} ${p.lastName}`;
	const sellerInfo = g.get("teamInfoCache")[sellerTid];
	const sellerName = `${sellerInfo?.region} ${sellerInfo?.name}`;
	const he = helpers.pronoun(g.get("gender"), "he");
	const currentSeason = g.get("season");

	const wageBudget = (await getWageBudgets()).get(userTid);
	const buyerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[currentSeason, userTid],
	);
	const sellerSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[currentSeason, sellerTid],
	);
	if (wageBudget === undefined || !buyerSeason || !sellerSeason) {
		return error("Your club or theirs has no season to transfer in.");
	}

	let askingPrice;
	if (inAcademy) {
		if (!isAcademyPlayerForSale(p)) {
			return error(
				`${name} is leaving the academy this summer, so ${he} can't be transferred.`,
			);
		}

		askingPrice = await getAcademyPlayerAskingPrice(p);
	} else {
		const untradable = isUntradable(p);
		if (untradable.untradable) {
			return error(untradable.untradableMsg);
		}

		const seasonsLeft = getContractSeasonsLeft({
			exp: p.contract.exp,
			season: currentSeason,
			phase: g.get("phase"),
		});
		if (seasonsLeft <= 0) {
			return error(
				`${name}'s contract is up, so ${he} will be a free agent instead.`,
			);
		}

		const userRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		);
		if (userRoster.length >= g.get("maxRosterSize")) {
			return error("Your roster is full. Release a player before buying one.");
		}

		const sellerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			sellerTid,
		);
		if (sellerRoster.length <= g.get("minRosterSize")) {
			return error(
				`The ${sellerName} can't sell anyone without going below the minimum roster size.`,
			);
		}

		const payroll = await team.getPayroll(userTid);
		if (payroll + p.contract.amount > wageBudget) {
			return error(
				`Your board won't let ${name}'s wages of ${formatFee(
					p.contract.amount,
				)} take your payroll over your wage budget of ${formatFee(wageBudget)}.`,
			);
		}

		const sellerValueChange = await new ValueChangeCalculator().evaluate({
			tid: sellerTid,
			pidsAdd: [],
			pidsRemove: [pid],
			dpidsAdd: [],
			dpidsRemove: [],
			tradingPartnerTid: userTid,
		});
		askingPrice = getAskingPrice({
			fee: getTransferFee({
				marketWage: player.genContract(p, false).amount,
				age: currentSeason - p.born.year,
				seasonsLeft,
			}),
			sellerValueChange,
		});
	}

	const response = respondToTransferOffer({ offer: fee, askingPrice });
	if (response !== "accept") {
		const dayKey = await getDayKey();
		if (lastLowOfferDayByPid.get(pid) === dayKey) {
			return error(
				`The ${sellerName} already turned down an offer for ${name} today.`,
			);
		}
		lastLowOfferDayByPid.set(pid, dayKey);

		if (response === "counter") {
			return {
				type: "counter",
				askingPrice,
				message: `The ${sellerName} want ${formatFee(askingPrice)} for ${name}.`,
			};
		}

		return {
			type: "reject",
			message: `The ${sellerName} rejected your offer of ${formatFee(
				fee,
			)} for ${name}.`,
		};
	}

	if (!canAffordFee({ cash: buyerSeason.cash, fee, wageBudget })) {
		return error(
			`You can't afford ${formatFee(
				fee,
			)}. A club can only go into debt down to half its wage budget.`,
		);
	}

	if (inAcademy) {
		await processAcademyTransfer({
			p,
			buyerTid: userTid,
			fee,
			buyerSeason,
			sellerSeason,
		});
	} else {
		await processTransfer({
			p,
			buyerTid: userTid,
			sellerTid,
			fee,
			buyerSeason,
			sellerSeason,
		});
	}

	await toUI("realtimeUpdate", [["playerMovement"]]);
	await recomputeLocalUITeamOvrs();

	return {
		type: "accept",
		message: inAcademy
			? `You bought ${name} from the ${sellerName} for ${formatFee(fee)}. ${helpers.upperCaseFirstLetter(he)} joins your academy.`
			: `You bought ${name} from the ${sellerName} for ${formatFee(fee)}.`,
	};
};
