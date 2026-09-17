import type { Player } from "../../../common/types.ts";
import { g } from "../../util/index.ts";
import { buildClubSummerPlan } from "./clubSquadPlan.ts";

/** Thin worker adapter from live Player rows to the pure summer planner. */
const buildClubSummerPlanForRoster = ({
	players,
	wageBudget,
}: {
	players: Player[];
	wageBudget: number;
}) =>
	buildClubSummerPlan({
		players: players.map((p) => ({
			pid: p.pid,
			value: p.value,
			valueNoPot: p.valueNoPot,
			age: g.get("season") - p.born.year,
			contract: p.contract,
		})),
		season: g.get("season"),
		wageBudget,
		minContract: g.get("minContract"),
		minimumRosterSize: g.get("minRosterSize"),
		maxRosterSize: g.get("maxRosterSize"),
		rotationSize: 2 * g.get("numPlayersOnCourt"),
	});

export default buildClubSummerPlanForRoster;
