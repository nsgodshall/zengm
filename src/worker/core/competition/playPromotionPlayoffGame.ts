import { GameSim, team } from "../index.ts";
import getWinner from "../../../common/getWinner.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import type {
	Conditions,
	ScheduleGame,
	ScheduleGameWithoutKey,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import loadTeams from "../game/loadTeams.ts";
import { gameSimToBoxScore } from "../game/writeGameStats.ts";
import writePlayerStats from "../game/writePlayerStats.ts";

/**
 * A new game id, from the schedule like any other game's, so a promotion playoff
 * box score never shares one with another game
 */
const getNewGid = async (homeTid: number, awayTid: number) => {
	const scheduleGame: ScheduleGameWithoutKey = { homeTid, awayTid, day: -1 };
	await idb.cache.schedule.add(scheduleGame);
	const { gid } = scheduleGame as ScheduleGame;
	await idb.cache.schedule.delete(gid);
	return gid;
};

/**
 * Simulate one promotion playoff game and return the winner's tid, the score,
 * and the game id of its box score.
 *
 * International Soccer Zen GM mod (Epic 8): the game is saved like a playoff
 * game, since the season ends during the playoffs phase: a box score, and the
 * players' stats as playoff stats. Injuries and team stats aren't, since only
 * who goes up matters and ZenGM's playoff revenue depends on its own playoff
 * series. The home side is the better seed, and if the game ends tied, the
 * better seed goes through.
 */
const playPromotionPlayoffGame = async (
	homeTid: number,
	awayTid: number,
	conditions: Conditions,
) => {
	const teams = await loadTeams([homeTid, awayTid], conditions);
	const home = teams[homeTid];
	const away = teams[awayTid];
	if (!home || !away) {
		throw new Error(
			`Could not load teams ${homeTid} and ${awayTid} for a promotion playoff game`,
		);
	}

	// Same as game.play: only baseball has a designated hitter setting, and it
	// depends on the home team's conference. Other sports don't have the
	// setting at all, so g.get("dh") would throw.
	let dh = false;
	if (isSport("baseball")) {
		const dhSetting = g.get("dh");
		dh =
			dhSetting === "all" ||
			(Array.isArray(dhSetting) && dhSetting.includes(home.cid));
	}

	// Also same as game.play: sports with depth charts need them built from the
	// loaded players right before the game
	for (const t of [home, away]) {
		if (t.depth !== undefined) {
			t.depth = team.getDepthPlayers(t.depth, t.player, dh);
		}
	}

	const gid = await getNewGid(homeTid, awayTid);

	const result = new GameSim({
		gid,
		// Not on the schedule, so it isn't on any day of the Daily Schedule
		day: undefined,
		teams: [home, away],
		doPlayByPlay: false,
		homeCourtFactor: 1,
		neutralSite: false,
		allStarGame: false,
		baseInjuryRate: 0,
		dh,
	}).run();

	await writePlayerStats([result], conditions);

	const homeSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[g.get("season"), homeTid],
	);
	const { gameStats } = await gameSimToBoxScore(
		result,
		homeSeason?.stadiumCapacity ?? g.get("defaultStadiumCapacity"),
	);
	await idb.cache.games.put(gameStats);

	const winner = getWinner([result.team[0].stat, result.team[1].stat]);

	return {
		gid,
		winnerTid: winner === 1 ? awayTid : homeTid,
		homePts: result.team[0].stat.pts as number,
		awayPts: result.team[1].stat.pts as number,
	};
};

export default playPromotionPlayoffGame;
