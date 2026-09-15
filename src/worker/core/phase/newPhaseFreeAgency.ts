import {
	competition,
	contractNegotiation,
	freeAgents,
	player,
} from "../index.ts";
import { helpers } from "../../util/index.ts";
import type { PhaseReturn } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { PLAYER } from "../../../common/constants.ts";
import { getNumPlayersTradedAwayNormalizedAll } from "../player/getNumPlayersTradedAwayNormalized.ts";

const newPhaseFreeAgency = async (): Promise<PhaseReturn> => {
	// In case some weird situation results in games still in the schedule, clear them
	await idb.cache.schedule.clear();

	// Delete all current negotiations to resign players
	await contractNegotiation.cancelAll();

	// International Soccer Zen GM mod (Epic 6): academy graduates the user didn't
	// promote or release during re-signing become free agents
	await competition.releaseUndecidedGraduates();

	// International Soccer Zen GM mod (Epic 4): the summer window's talent pool
	// arrives with free agency
	await competition.ensureTalentPool();

	await freeAgents.ensureEnoughPlayers();

	await freeAgents.normalizeContractDemands({ type: "freeAgentsOnly" });

	// For any players who were free agents last year too, reset numPlayersTradedAwayNormalized
	const numPlayersTradedAwayNormalized =
		await getNumPlayersTradedAwayNormalizedAll();
	const players = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	).filter((p) => p.yearsFreeAgent > 0);
	for (const p of players) {
		player.addToFreeAgents(p, numPlayersTradedAwayNormalized);
	}
	await idb.cache.players.putAll(players);

	return {
		redirect: {
			url: helpers.leagueUrl(["free_agents"]),
			text: "View free agents",
		},
		updateEvents: ["playerMovement"],
	};
};

export default newPhaseFreeAgency;
