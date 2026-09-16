import { PLAYER } from "../../../common/constants.ts";
import { player, team } from "../index.ts";
import getBest from "./getBest.ts";
import { idb } from "../../db/index.ts";
import { g, local } from "../../util/index.ts";
import { orderBy } from "../../../common/utils.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import { shuffle } from "../../../common/random.ts";
import { isSingleDivision } from "../competition/competitionStructure.ts";
import { getCompetitionStructure } from "../competition/ensureCompetitionStructure.ts";
import { getWageBudgets } from "../competition/wageBudgets.ts";
import { getWorldNewContractLimitForPlayer } from "../competition/contractLimits.ts";

/**
 * AI teams sign free agents.
 *
 * Each team (in random order) will sign free agents up to their salary cap or roster size limit. This should eventually be made smarter
 *
 * @memberOf core.freeAgents
 * @return {Promise}
 */
const autoSign = async () => {
	const players = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	if (players.length === 0) {
		return;
	}

	// List of free agents, sorted by value
	let playersSorted = orderBy(players, "value", "desc");

	// International Soccer Zen GM mod (Epic 4): in a World, clubs sign free
	// agents within their wage budgets rather than a salary cap
	const wageBudgets = isSingleDivision(getCompetitionStructure())
		? undefined
		: await getWageBudgets();

	// Randomly order teams
	const teams = await idb.cache.teams.getAll();
	const tierByDivisionId = new Map(
		getCompetitionStructure().competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	shuffle(teams);

	for (const t of teams) {
		// Skip the user's team
		if (
			g.get("userTids").includes(t.tid) &&
			!local.autoPlayUntil &&
			!g.get("spectator")
		) {
			continue;
		}

		if (t.disabled) {
			continue;
		}

		let probSkip;
		if (isSport("basketball")) {
			probSkip = t.strategy === "rebuilding" ? 0.9 : 0.75;
		} else {
			probSkip = 0.5;
		}

		// Skip teams sometimes
		if (Math.random() < probSkip) {
			continue;
		}

		const playersOnRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			t.tid,
		);

		// With forceHistoricalRosters, only sign FAs if we have to
		if (
			playersOnRoster.length >= g.get("minRosterSize") &&
			g.get("forceHistoricalRosters")
		) {
			continue;
		}

		// Ignore roster size, will drop bad player if necessary in checkRosterSizes, and getBest won't sign min contract player unless under the roster limit
		const payroll = await team.getPayroll(t.tid);
		const wageBudget = wageBudgets?.get(t.tid);
		const isLowerTier =
			t.divisionId !== undefined &&
			(tierByDivisionId.get(t.divisionId) ?? 1) > 1;
		const p = getBest(
			playersOnRoster,
			playersSorted,
			payroll,
			wageBudget,
			isLowerTier && wageBudget !== undefined
				? (candidate) =>
						getWorldNewContractLimitForPlayer({
							wageBudget,
							minContract: g.get("minContract"),
							playerValue: candidate.valueNoPot,
							rosterValues: playersOnRoster.map(
								(rosterPlayer) => rosterPlayer.valueNoPot,
							),
						}).limit
				: undefined,
		);
		if (p) {
			// Remove from list of free agents
			playersSorted = playersSorted.filter((p2) => p2 !== p);

			await player.sign(p, t.tid, p.contract, g.get("phase"));
			await idb.cache.players.put(p);
			await team.rosterAutoSort(t.tid);
		}
	}
};

export default autoSign;
