import type { PlayerWithoutKey } from "../../../common/types.ts";
import { last } from "../../../common/utils.ts";
import { team } from "../index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { assignSquads, getSquadOrder } from "./startingStrength.ts";

/**
 * In a new World, moves the randomly generated squads between clubs, each squad
 * as a whole, so the strongest go to the clubs at the top of getSquadOrder: the
 * top tiers first, and bigger clubs within a tier. Call it before the players
 * are saved or made local to their clubs.
 */
export const assignStartingSquads = async (
	players: PlayerWithoutKey[],
	teams: { tid: number; divisionId?: number; pop: number }[],
) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const tierByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	const clubs: { tid: number; tier: number; pop: number }[] = [];
	for (const t of teams) {
		const tier =
			t.divisionId === undefined
				? undefined
				: tierByDivisionId.get(t.divisionId);
		if (tier !== undefined) {
			clubs.push({ tid: t.tid, tier, pop: t.pop });
		}
	}

	const squadOvrs = clubs.map((club) => ({
		tid: club.tid,
		ovr: team.ovr(
			players
				.filter((p) => p.tid === club.tid)
				.map((p) => ({
					pid: undefined,
					injury: p.injury,
					value: p.value,
					ratings: last(p.ratings),
				})),
		),
	}));

	const newTidByTid = assignSquads({
		squadOvrs,
		order: getSquadOrder({ clubs }),
	});
	for (const p of players) {
		const newTid = newTidByTid.get(p.tid);
		if (newTid !== undefined) {
			p.tid = newTid;
		}
	}
};
