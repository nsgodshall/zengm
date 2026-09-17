import type { Player, TeamSeason } from "../../../common/types.ts";
import { g } from "../../util/index.ts";
import { buildClubSummerPlan } from "./clubSquadPlan.ts";
import { buildWorldClubStrategy } from "./clubStrategy.ts";

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

export const buildWorldClubStrategyForRoster = ({
	players,
	wageBudget,
	tier,
	previousTier,
	teamStrategy,
	boardObjectiveKind,
	cash,
}: {
	players: Player[];
	wageBudget: number;
	tier: number;
	previousTier?: number;
	teamStrategy: "contending" | "rebuilding";
	boardObjectiveKind?: NonNullable<TeamSeason["boardObjective"]>["kind"];
	cash: number;
}) =>
	buildWorldClubStrategy({
		tier,
		previousTier,
		teamStrategy,
		boardObjectiveKind,
		players: players.map((p) => ({
			age: g.get("season") - p.born.year,
			contract: p.contract,
		})),
		season: g.get("season"),
		cash,
		wageBudget,
	});
