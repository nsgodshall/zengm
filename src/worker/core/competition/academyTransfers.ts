import { PHASE } from "../../../common/constants.ts";
import { choice } from "../../../common/random.ts";
import type { Player, TeamSeason } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import { getAcademyPlayers } from "./academies.ts";
import { recordTransfer } from "./recordTransfer.ts";
import {
	aiWantsAcademyPlayer,
	canAffordFee,
	getAcademyAskingPrice,
	getAcademyTransferFee,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

// International Soccer Zen GM mod (Epic 4): buying and selling academy players.
// A bought player joins the buying club's academy, so only its cash limits it,
// not its roster or wage budget.

/**
 * Whether an academy player can be transferred: not once his club has decided
 * on him in the summer he has to leave its academy
 */
export const isAcademyPlayerForSale = (p: Player) =>
	p.draft.year > g.get("season") || g.get("phase") < PHASE.DRAFT;

/** An academy player's fee, in thousands of dollars (see getAcademyTransferFee) */
export const getAcademyPlayerFee = (p: Player) =>
	getAcademyTransferFee({
		marketWage: player.genContract(p, false).amount,
		minContract: g.get("minContract"),
	});

/** What an academy player's club asks for him, in thousands of dollars */
export const getAcademyPlayerAskingPrice = async (p: Player) => {
	const academyPlayers = await getAcademyPlayers(p.academyTid);
	return getAcademyAskingPrice({
		fee: getAcademyPlayerFee(p),
		isBestInAcademy: academyPlayers.every(
			(p2) => p2.pid === p.pid || p2.value <= p.value,
		),
	});
};

/**
 * Moves an academy player into the buying club's academy, which pays the fee
 * (thousands of dollars) to his old club
 */
export const processAcademyTransfer = async ({
	p,
	buyerTid,
	fee,
	buyerSeason,
	sellerSeason,
}: {
	p: Player;
	buyerTid: number;
	fee: number;
	buyerSeason: TeamSeason;
	sellerSeason: TeamSeason;
}) => {
	const sellerTid = p.academyTid!;
	p.academyTid = buyerTid;
	delete p.transferOffers;
	delete p.transferListed;

	await recordTransfer({
		p,
		buyerTid,
		sellerTid,
		fee,
		buyerSeason,
		sellerSeason,
		academy: true,
	});
	await idb.cache.players.put(p);
};

/**
 * AI clubs (`aiTids`) try up to `numAttempts` times to buy academy players from
 * each other. A club only buys a player who'd be one of the best in its academy
 * (see aiWantsAcademyPlayer), for his club's asking price, if it can afford it.
 * Returns how many transfers happened.
 */
export const academyTransfersBetweenAiClubs = async (
	numAttempts: number,
	aiTids: number[],
) => {
	if (numAttempts <= 0 || aiTids.length < 2) {
		return 0;
	}

	const season = g.get("season");
	const wageBudgets = await getWageBudgets();

	let numTransfers = 0;
	for (let i = 0; i < numAttempts; i++) {
		const buyerTid = choice(aiTids);
		const academyPlayers = await getAcademyPlayers();
		const candidates = academyPlayers.filter(
			(p) =>
				p.academyTid !== buyerTid &&
				aiTids.includes(p.academyTid!) &&
				isAcademyPlayerForSale(p),
		);

		// Like AI transfers, better players are more likely to be looked at
		const p = choice(candidates, (p) => p.value);
		if (
			!p ||
			buyerTid === undefined ||
			!aiWantsAcademyPlayer({
				value: p.value,
				academyValues: academyPlayers
					.filter((p2) => p2.academyTid === buyerTid)
					.map((p2) => p2.value),
			})
		) {
			continue;
		}

		const fee = await getAcademyPlayerAskingPrice(p);
		const buyerSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, buyerTid],
		);
		const sellerSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, p.academyTid!],
		);
		const wageBudget = wageBudgets.get(buyerTid);
		if (
			!buyerSeason ||
			!sellerSeason ||
			wageBudget === undefined ||
			!canAffordFee({ cash: buyerSeason.cash, fee, wageBudget })
		) {
			continue;
		}

		await processAcademyTransfer({
			p,
			buyerTid,
			fee,
			buyerSeason,
			sellerSeason,
		});
		numTransfers += 1;
	}

	return numTransfers;
};
