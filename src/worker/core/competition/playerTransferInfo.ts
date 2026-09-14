import { PLAYER } from "../../../common/constants.ts";
import type { Player } from "../../../common/types.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import {
	getAcademyPlayerFee,
	isAcademyPlayerForSale,
} from "./academyTransfers.ts";
import { getCurrentTransferWindow } from "./aiTransfers.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getContractSeasonsLeft, getTransferFee } from "./transferMarket.ts";

/**
 * International Soccer Zen GM mod (Epic 6): what a player page needs for its
 * transfer, loan, and academy buttons, for a player at a club, in its first
 * team or its academy. Undefined outside a World, or for a player who isn't at
 * a club.
 */
export const getPlayerTransferInfo = async (p: Player) => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const inAcademy = p.tid === PLAYER.UNDRAFTED && p.academyTid !== undefined;
	const clubTid = inAcademy ? p.academyTid! : p.tid;
	if (clubTid < 0) {
		return;
	}

	const season = g.get("season");
	const fee = inAcademy
		? getAcademyPlayerFee(p)
		: getTransferFee({
				marketWage: player.genContract(p, false).amount,
				age: season - p.born.year,
				seasonsLeft: getContractSeasonsLeft({
					exp: p.contract.exp,
					season,
					phase: g.get("phase"),
				}),
			});

	return {
		clubTid,
		abbrev: g.get("teamInfoCache")[clubTid]?.abbrev ?? "",
		inAcademy,
		userClub: g.get("userTids").includes(clubTid),
		// Millions of dollars, like contracts in the UI
		fee: fee / 1000,
		academyForSale: inAcademy && isAcademyPlayerForSale(p),
		transferListed: !!p.transferListed,
		loanListed: !!p.loanListed,
		onLoan: p.loan !== undefined,
		transferWindow: await getCurrentTransferWindow(),
	};
};
