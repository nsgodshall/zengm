import type { Player, TeamSeason } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import teamLink from "./teamLink.ts";

/**
 * The money and paperwork of any transfer: the buying club pays the fee
 * (thousands of dollars) to the selling club, and the transfer goes in the news
 * and the player's transactions. The caller moves the player and saves him.
 */
export const recordTransfer = async ({
	p,
	buyerTid,
	sellerTid,
	fee,
	buyerSeason,
	sellerSeason,
	academy = false,
}: {
	p: Player;
	buyerTid: number;
	sellerTid: number;
	fee: number;
	buyerSeason: TeamSeason;
	sellerSeason: TeamSeason;
	academy?: boolean;
}) => {
	buyerSeason.cash -= fee;
	sellerSeason.cash += fee;
	await idb.cache.teamSeasons.putAll([buyerSeason, sellerSeason]);

	const eid = await logEvent({
		type: "transfer",
		text: `The ${teamLink(buyerTid)} bought ${academy ? "academy player " : ""}<a href="${helpers.leagueUrl(
			["player", p.pid],
		)}">${p.firstName} ${p.lastName}</a> from the ${teamLink(sellerTid)} for ${
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
};
