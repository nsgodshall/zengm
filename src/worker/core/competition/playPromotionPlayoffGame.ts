import { GameSim, team } from "../index.ts";
import getWinner from "../../../common/getWinner.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import type { Conditions } from "../../../common/types.ts";
import { g } from "../../util/index.ts";
import loadTeams from "../game/loadTeams.ts";

/**
 * Simulate one promotion playoff game and return the winner's tid.
 *
 * Nothing is saved - no box score, stats, or injuries - since the season is
 * over and only who goes up matters. The home side is the better seed, and if
 * the game ends tied, the better seed goes through.
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

	const result = new GameSim({
		gid: -1,
		day: -1,
		teams: [home, away],
		doPlayByPlay: false,
		homeCourtFactor: 1,
		neutralSite: false,
		allStarGame: false,
		baseInjuryRate: 0,
		dh,
	}).run();

	const winner = getWinner([result.team[0].stat, result.team[1].stat]);

	return winner === 1 ? awayTid : homeTid;
};

export default playPromotionPlayoffGame;
