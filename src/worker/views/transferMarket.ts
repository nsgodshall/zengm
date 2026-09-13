import type { UpdateEvents } from "../../common/types.ts";
import { competition, player, team } from "../core/index.ts";
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
 * International Soccer Zen GM mod (Epic 6): every player at another club, with
 * his transfer fee at market value, for the user to make offers on (see
 * competition/userTransfers.ts)
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
			if (!t.disabled && !userTids.includes(t.tid)) {
				divisionNameByTid.set(
					t.tid,
					(t.divisionId === undefined
						? undefined
						: divisionNameById.get(t.divisionId)) ?? "",
				);
			}
		}

		const playersRaw = (
			await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
		).filter((p) => divisionNameByTid.has(p.tid));

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
			],
			ratings: ["ovr", "pot", "skills", "pos"],
			season,
			showNoStats: true,
			showRookies: true,
			fuzz: true,
		});

		const players = addFirstNameShort(
			playersPlus.map((p) => {
				const info = infoByPid.get(p.pid)!;
				return {
					...p,
					divisionName: divisionNameByTid.get(p.tid) ?? "",
					// Millions of dollars, like contracts in the UI
					fee: info.fee / 1000,
					untradableMsg: info.untradableMsg,
				};
			}),
		);

		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, userTid],
		);

		return {
			// Millions of dollars
			cash: (teamSeason?.cash ?? 0) / 1000,
			maxRosterSize: g.get("maxRosterSize"),
			numPlayersOnRoster: (
				await idb.cache.players.indexGetAll("playersByTid", userTid)
			).length,
			payroll: (await team.getPayroll(userTid)) / 1000,
			players,
			season,
			spectator: g.get("spectator"),
			transferWindow: await competition.getCurrentTransferWindow(),
			wageBudget: ((await getWageBudgets()).get(userTid) ?? 0) / 1000,
		};
	}
};

export default updateTransferMarket;
