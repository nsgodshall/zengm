import type {
	GameAttributesLeague,
	Player,
	TeamSeason,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { league } from "../index.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import { ensureWorldFinanceLedger } from "./worldInfrastructure.ts";
import {
	describeTransfer,
	getBrokenTransferRecords,
	updateClubRecordSigning,
	updateTransferRecords,
} from "./transferRecords.ts";
import { WORLD_COUNTRIES } from "./worldCountries.ts";

// The Country a club plays in
const getCountry = (divisionId: number | undefined) => {
	const structure = getCompetitionStructure();
	const countryId = structure.competitionDivisions.find(
		(division) => division.divisionId === divisionId,
	)?.countryId;
	return structure.countries.find((country) => country.countryId === countryId);
};

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
	buyerSeason.worldFinance = ensureWorldFinanceLedger(buyerSeason.worldFinance);
	sellerSeason.worldFinance = ensureWorldFinanceLedger(
		sellerSeason.worldFinance,
	);
	buyerSeason.worldFinance.transferFeesPaid += fee;
	sellerSeason.worldFinance.transferFeesReceived += fee;
	await idb.cache.teamSeasons.putAll([buyerSeason, sellerSeason]);

	// Storytelling: the records the fee breaks, and a player going back to the
	// club he started at (see competition/transferRecords.ts)
	const buyer = await idb.cache.teams.get(buyerTid);
	const country = getCountry(buyer?.divisionId);
	const records = (g as unknown as Partial<GameAttributesLeague>)
		.worldTransferRecords;
	const firstTid =
		p.transactions?.find((transaction) => transaction.type === "academy")
			?.tid ?? p.stats[0]?.tid;
	const context = describeTransfer({
		broken: getBrokenTransferRecords({
			fee,
			countryId: country?.countryId,
			records,
			clubRecord: buyer?.worldRecordSigning,
		}),
		countryAdjective: WORLD_COUNTRIES.find(
			(worldCountry) => worldCountry.name === country?.name,
		)?.adjective,
		returnsToFirstClub:
			!academy && firstTid === buyerTid && sellerTid !== buyerTid,
	});

	const eid = await logEvent({
		type: "transfer",
		text: `The ${teamLink(buyerTid)} bought ${academy ? "academy player " : ""}<a href="${helpers.leagueUrl(
			["player", p.pid],
		)}">${p.firstName} ${p.lastName}</a> from the ${teamLink(sellerTid)} for ${
			fee > 0 ? helpers.formatCurrency(fee / 1000, "M") : "free"
		}.${context.sentences.map((sentence) => ` ${sentence}`).join("")}`,
		showNotification: false,
		pids: [p.pid],
		tids: [buyerTid, sellerTid],
		score:
			Math.round(helpers.bound(p.valueFuzz - 40, 0, Infinity)) +
			context.scoreBonus,
	});

	if (fee > 0) {
		const transfer = {
			fee,
			pid: p.pid,
			name: `${p.firstName} ${p.lastName}`,
			buyerTid,
			sellerTid,
			season: g.get("season"),
		};
		await league.setGameAttributes({
			worldTransferRecords: updateTransferRecords({
				records,
				countryId: country?.countryId,
				transfer,
			}),
		});
		if (buyer) {
			buyer.worldRecordSigning = updateClubRecordSigning(
				buyer.worldRecordSigning,
				transfer,
			);
			await idb.cache.teams.put(buyer);
		}
	}

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

/**
 * International Soccer Zen GM mod (storytelling): a World made before record
 * fees were kept finds them from its players' transfers, once, when it loads
 */
export const fillWorldTransferRecords = async () => {
	if (
		(g as unknown as Partial<GameAttributesLeague>).worldTransferRecordsFilled
	) {
		return;
	}

	const players: Player[] = await idb.getCopies.players({}, "noCopyCache");
	const transfers = players
		.flatMap((p) =>
			(p.transactions ?? []).flatMap((transaction) =>
				transaction.type === "transfer" && transaction.fee > 0
					? [
							{
								fee: transaction.fee,
								pid: p.pid,
								name: `${p.firstName} ${p.lastName}`,
								buyerTid: transaction.tid,
								sellerTid: transaction.fromTid,
								season: transaction.season,
							},
						]
					: [],
			),
		)
		.sort((a, b) => a.season - b.season);

	const teams = await idb.cache.teams.getAll();
	let records: ReturnType<typeof updateTransferRecords> | undefined;
	for (const transfer of transfers) {
		const buyer = teams.find((t) => t.tid === transfer.buyerTid);
		records = updateTransferRecords({
			records,
			countryId: getCountry(buyer?.divisionId)?.countryId,
			transfer,
		});
		if (buyer) {
			buyer.worldRecordSigning = updateClubRecordSigning(
				buyer.worldRecordSigning,
				transfer,
			);
		}
	}
	for (const t of teams) {
		if (t.worldRecordSigning) {
			await idb.cache.teams.put(t);
		}
	}

	await league.setGameAttributes({
		...(records ? { worldTransferRecords: records } : {}),
		worldTransferRecordsFilled: true,
	});
};
