import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { getAcademyPlayers } from "./academies.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * International Soccer Zen GM mod (Epic 6): a club's academy at a glance, for
 * its team page: how many players it has and its best prospect, with ratings
 * fuzzed by the user's scouting like on the academy page. Undefined outside a
 * World.
 */
export const getAcademySummary = async (tid: number) => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const academyPlayers = await getAcademyPlayers(tid);
	const playersPlus = await idb.getCopies.playersPlus(academyPlayers, {
		attrs: ["pid", "firstName", "lastName", "age", "valueFuzz"],
		ratings: ["ovr", "pot", "pos"],
		season: g.get("season"),
		showNoStats: true,
		showRookies: true,
		fuzz: true,
	});

	const best = playersPlus.sort((a, b) => b.valueFuzz - a.valueFuzz)[0];

	return {
		numPlayers: academyPlayers.length,
		best: best
			? {
					pid: best.pid as number,
					name: `${best.firstName} ${best.lastName}`,
					age: best.age as number,
					ovr: best.ratings.ovr as number,
					pot: best.ratings.pot as number,
					pos: best.ratings.pos as string,
				}
			: undefined,
	};
};
