import type { Player, UpdateEvents } from "../../common/types.ts";
import { competition, player, team } from "../core/index.ts";
import {
	getAcademyPlayerFee,
	isAcademyPlayerForSale,
} from "../core/competition/academyTransfers.ts";
import {
	getContractSeasonsLeft,
	getTransferFee,
} from "../core/competition/transferMarket.ts";
import { getWageBudgets } from "../core/competition/wageBudgets.ts";
import isUntradable from "../core/trade/isUntradable.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";

/**
 * International Soccer Zen GM mod (Epic 6): the user's transfer business. Offers
 * from AI clubs for the user's players (see competition/aiOffers.ts), the user's
 * own players with their transfer list, and every player at another club, in
 * its first team or its academy, to make offers on (see
 * competition/userTransfers.ts), each with his transfer fee at market value.
 */
const updateTransferMarket = async (
	inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("newPhase")
	) {
		const structure = competition.getCompetitionStructure();
		if (competition.isSingleDivision(structure)) {
			return {
				errorMessage:
					"The transfer market only exists in a World, a league with more than one Division.",
			};
		}

		const season = g.get("season");
		const phase = g.get("phase");
		const userTid = g.get("userTid");
		const userTids = g.get("userTids");

		const divisionNameById = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.name,
			]),
		);
		const divisionNameByTid = new Map<number, string>();
		for (const t of await idb.cache.teams.getAll()) {
			if (!t.disabled) {
				divisionNameByTid.set(
					t.tid,
					(t.divisionId === undefined
						? undefined
						: divisionNameById.get(t.divisionId)) ?? "",
				);
			}
		}

		const getMarketPlayers = async (playersRaw: Player[]) => {
			const infoByPid = new Map(
				playersRaw.map((p) => {
					const seasonsLeft = getContractSeasonsLeft({
						exp: p.contract.exp,
						season,
						phase,
					});
					const fee = getTransferFee({
						marketWage: player.genContract(p, false).amount,
						age: season - p.born.year,
						seasonsLeft,
					});
					const untradableMsg =
						seasonsLeft <= 0
							? "Contract is up, so he'll be a free agent instead"
							: isUntradable(p).untradableMsg;
					return [p.pid, { fee, untradableMsg }];
				}),
			);

			const playersPlus = await idb.getCopies.playersPlus(playersRaw, {
				attrs: [
					"pid",
					"tid",
					"abbrev",
					"firstName",
					"lastName",
					"age",
					"contract",
					"draft",
					"injury",
					"watch",
					"transferListed",
					"transferOffers",
				],
				ratings: ["ovr", "pot", "skills", "pos"],
				season,
				showNoStats: true,
				showRookies: true,
				fuzz: true,
			});

			return addFirstNameShort(
				playersPlus.map((p) => {
					const info = infoByPid.get(p.pid)!;
					return {
						...p,
						divisionName: divisionNameByTid.get(p.tid) ?? "",
						// Millions of dollars, like contracts in the UI
						fee: info.fee / 1000,
						transferListed: !!p.transferListed,
						transferOffers: (p.transferOffers ?? []) as NonNullable<
							Player["transferOffers"]
						>,
						untradableMsg: info.untradableMsg,
					};
				}),
			);
		};

		const allPlayers = (
			await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
		).filter((p) => divisionNameByTid.has(p.tid));

		const players = await getMarketPlayers(
			allPlayers.filter((p) => !userTids.includes(p.tid)),
		);
		const userPlayers = await getMarketPlayers(
			allPlayers.filter((p) => userTids.includes(p.tid)),
		);

		const teamInfoCache = g.get("teamInfoCache");

		// Other clubs' academy players, who'd join the user's academy
		const academyPlayersRaw = (await competition.getAcademyPlayers()).filter(
			(p) =>
				!userTids.includes(p.academyTid!) &&
				divisionNameByTid.has(p.academyTid!) &&
				isAcademyPlayerForSale(p),
		);
		const academyInfoByPid = new Map(
			academyPlayersRaw.map((p) => [
				p.pid,
				{ tid: p.academyTid!, fee: getAcademyPlayerFee(p) },
			]),
		);
		const academyPlayers = addFirstNameShort(
			(
				await idb.getCopies.playersPlus(academyPlayersRaw, {
					attrs: [
						"pid",
						"firstName",
						"lastName",
						"age",
						"draft",
						"injury",
						"watch",
					],
					ratings: ["ovr", "pot", "skills", "pos"],
					season,
					showNoStats: true,
					showRookies: true,
					fuzz: true,
				})
			).map((p) => {
				const { tid, fee } = academyInfoByPid.get(p.pid)!;
				return {
					...p,
					abbrev: teamInfoCache[tid]?.abbrev ?? "",
					divisionName: divisionNameByTid.get(tid) ?? "",
					// Millions of dollars
					fee: fee / 1000,
					graduationSeason: p.draft.year as number,
					tid,
				};
			}),
		);

		const offers = userPlayers.flatMap((p) =>
			p.transferOffers.map(
				(offer: NonNullable<Player["transferOffers"]>[number]) => ({
					...p,
					buyerAbbrev: teamInfoCache[offer.tid]?.abbrev ?? "",
					buyerDivisionName: divisionNameByTid.get(offer.tid) ?? "",
					buyerTid: offer.tid,
					daysLeft: offer.daysLeft,
					// Millions of dollars
					offerFee: offer.fee / 1000,
				}),
			),
		);

		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, userTid],
		);

		return {
			academyPlayers,
			// Millions of dollars
			cash: (teamSeason?.cash ?? 0) / 1000,
			maxRosterSize: g.get("maxRosterSize"),
			numPlayersOnRoster: (
				await idb.cache.players.indexGetAll("playersByTid", userTid)
			).length,
			offers,
			payroll: (await team.getPayroll(userTid)) / 1000,
			players,
			season,
			spectator: g.get("spectator"),
			transferWindow: await competition.getCurrentTransferWindow(),
			userPlayers,
			wageBudget: ((await getWageBudgets()).get(userTid) ?? 0) / 1000,
		};
	}
};

export default updateTransferMarket;
