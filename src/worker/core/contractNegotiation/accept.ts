import { player, team } from "../index.ts";
import cancel from "./cancel.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, toUI } from "../../util/index.ts";
import type { Negotiation, PlayerContract } from "../../../common/types.ts";
import { PHASE, PLAYER } from "../../../common/constants.ts";
import { actualPhase } from "../../util/actualPhase.ts";
import { isSingleDivision } from "../competition/competitionStructure.ts";
import { getCompetitionStructure } from "../competition/ensureCompetitionStructure.ts";
import { canSignWithinWageBudget } from "../competition/transferMarket.ts";
import { getWageBudgets } from "../competition/wageBudgets.ts";
import { getWorldNewContractLimitForPlayer } from "../competition/contractLimits.ts";

/**
 * Accept the player's offer.
 *
 * If successful, then the team's current roster will be displayed.
 *
 * @memberOf core.contractNegotiation
 * @param {number} pid An integer that must correspond with the player ID of a player in an ongoing negotiation.
 * @return {Promise.<string=>} If an error occurs, resolves to a string error message.
 */
const accept = async <
	DryRun extends boolean,
	SuccessReturn extends (DryRun extends true ? void : () => Promise<boolean>),
>({
	negotiation,
	amount,
	exp,
	dryRun,
}: {
	negotiation: Negotiation;
	amount: number;
	exp: number;
	dryRun: DryRun;
}) => {
	const salaryCapType = g.get("salaryCapType");
	const tid = g.get("userTid");
	const p = await idb.cache.players.get(negotiation.pid);
	if (!p) {
		return "Invalid pid";
	}

	if (salaryCapType !== "none") {
		const payroll = await team.getPayroll(tid);
		const birdException = negotiation.resigning && salaryCapType === "soft";

		// If this contract brings team over the salary cap, it's not a minimum contract, and it's not re-signing a current
		// player with the Bird exception, ERROR!
		if (
			!birdException &&
			payroll + amount - 1 > g.get("salaryCap") &&
			amount - 1 > g.get("minContract")
		) {
			return `You cannot go over the salary cap to sign ${
				salaryCapType === "hard" ? "players" : "free agents"
			} to contracts higher than the minimum salary.`;
		}
	}

	// International Soccer Zen GM mod (Epic 4): a World has no salary cap, but
	// the club's board sets a wage budget. Decided in Epic 8: it works like a
	// hard cap, so re-signing a player has to fit it too, and only minimum
	// contracts can go over.
	if (!isSingleDivision(getCompetitionStructure())) {
		const payroll = await team.getPayroll(tid);
		const wageBudget = (await getWageBudgets()).get(tid);
		if (
			wageBudget !== undefined &&
			!canSignWithinWageBudget({
				payroll,
				amount,
				wageBudget,
				minContract: g.get("minContract"),
			})
		) {
			return `Your board won't let you go over your wage budget of ${helpers.formatCurrency(
				wageBudget / 1000,
				"M",
			)} to ${negotiation.resigning ? "re-sign" : "sign"} players to contracts higher than the minimum salary.`;
		}

		const t = await idb.cache.teams.get(tid);
		const structure = getCompetitionStructure();
		const tier = structure.competitionDivisions.find(
			(division) => division.divisionId === t?.divisionId,
		)?.tier;
		if (
			wageBudget !== undefined &&
			(tier ?? 1) > 1 &&
			amount > g.get("minContract")
		) {
			const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
			const { limit, role } = getWorldNewContractLimitForPlayer({
				wageBudget,
				minContract: g.get("minContract"),
				playerValue: p.valueNoPot,
				rosterValues: roster.map((other) => other.valueNoPot),
			});
			if (amount > limit) {
				return `Your board values this player as a ${role} squad player and will approve at most ${helpers.formatCurrency(
					limit / 1000,
					"M",
				)} a season, after reserving enough wage budget for a complete squad.`;
			}
		}
	}

	// This error is for sanity checking in multi team mode. Need to check for existence of negotiation.tid because it
	// wasn't there originally and I didn't write upgrade code. Can safely get rid of it later.
	if (negotiation.tid !== undefined && negotiation.tid !== tid) {
		return `This negotiation was started by the ${
			g.get("teamInfoCache")[negotiation.tid]?.region
		} ${g.get("teamInfoCache")[negotiation.tid]?.name} but you are the ${
			g.get("teamInfoCache")[tid]?.region
		} ${
			g.get("teamInfoCache")[tid]?.name
		}. Either switch teams or cancel this negotiation.`;
	}

	// Make sure the user didn't do something in another tab to change the willingness to negotiate, such as trading away players
	const mood = await player.moodInfo(p, tid);
	if (!mood.willing) {
		return "Player is no longer willing to negotiate.";
	}

	const phase = actualPhase();

	const contract: PlayerContract = {
		amount,
		exp,
	};
	if (p.contract.rookie && phase === PHASE.RESIGN_PLAYERS) {
		// Not sure if the phase condition is necessary. The purpose of this is for hard cap rookies with rookie contract scale.
		contract.rookie = true;
	}

	if (!dryRun) {
		const rollbackInfo = {
			numDaysFreeAgent: p.numDaysFreeAgent,
			numPlayersTradedAwayNormalized: helpers.deepCopy(
				p.numPlayersTradedAwayNormalized,
			),
			jerseyNumber: p.jerseyNumber,
			contract: helpers.deepCopy(p.contract),
			salaries: helpers.deepCopy(p.salaries),
			transactions: helpers.deepCopy(p.transactions),
		};

		const eid = await player.sign(p, tid, contract, phase);
		await idb.cache.players.put(p);
		await cancel(negotiation.pid);

		// Rollback
		return (async () => {
			const p = await idb.cache.players.get(negotiation.pid);
			if (!p) {
				return false;
			}

			if (p.tid !== tid) {
				return false;
			}

			Object.assign(p, rollbackInfo);
			p.tid = PLAYER.FREE_AGENT;

			if (phase === PHASE.RESIGN_PLAYERS) {
				await idb.cache.negotiations.add({
					pid: p.pid,
					tid,
					resigning: true,
				});
			}

			await idb.cache.players.put(p);
			await idb.cache.events.delete(eid);

			void toUI("realtimeUpdate", [["playerMovement"]]);

			return true;
		}) as SuccessReturn;
	}

	return undefined as SuccessReturn;
};

export default accept;
