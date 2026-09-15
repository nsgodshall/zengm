import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import { getNumPlayersTradedAwayNormalizedAll } from "../player/getNumPlayersTradedAwayNormalized.ts";
import { getContractSeasonsLeft } from "./transferMarket.ts";

/**
 * International Soccer Zen GM mod (Epic 8, decided): relegation clauses. When
 * a club is relegated, its best-paid players walk away that summer: their
 * contracts end, the club stops paying them, and they become free agents, so
 * free agency sets their new wages at what clubs can actually pay. Relegated
 * clubs shed wages instead of keeping squads strong enough to go straight back
 * up, and promoted clubs, with their bigger TV money (see worldRevenue.ts), can
 * sign them. A first version let other clubs buy them for their fee, but free
 * agency leaves almost no club with room in its wage budget for that. The long
 * run (src/test/worldLongRun.test.ts) can override these settings, to tune them
 * against real promotion survival rates.
 */
export const RELEGATION_CLAUSE_SETTINGS = {
	// How many of a relegated club's best-paid players walk away. Tuned in
	// 10-season long runs so relegated clubs go straight back up about as often
	// as in real leagues. Retuned from 8 once the talent pool and academy loans
	// gave relegated clubs more ways to rebuild.
	numPlayers: 10,
};

/**
 * The players who walk away when their club is relegated: its best-paid
 * players with at least a season left on their contracts
 */
export const pickRelegationClausePlayers = <
	T extends { contractAmount: number; seasonsLeft: number },
>(
	players: T[],
	numPlayers = RELEGATION_CLAUSE_SETTINGS.numPlayers,
) =>
	players
		.filter((p) => p.seasonsLeft > 0)
		.sort((a, b) => b.contractAmount - a.contractAmount)
		.slice(0, numPlayers);

/**
 * A club being relegated at the end of this season loses its relegation clause
 * players (see pickRelegationClausePlayers) to free agency, without paying the
 * rest of their contracts. Returns them.
 */
export const releaseRelegationClausePlayers = async (tid: number) => {
	const season = g.get("season");
	const roster = (await idb.cache.players.indexGetAll("playersByTid", tid))
		// A player on loan belongs to another club
		.filter((p) => p.loan === undefined);

	const picked = pickRelegationClausePlayers(
		roster.map((p) => ({
			p,
			contractAmount: p.contract.amount,
			// Counting from the summer, once this season is over
			seasonsLeft: getContractSeasonsLeft({
				exp: p.contract.exp,
				season,
				phase: PHASE.DRAFT_LOTTERY,
			}),
		})),
	);

	const numPlayersTradedAwayNormalized =
		await getNumPlayersTradedAwayNormalizedAll();
	for (const { p } of picked) {
		p.relegationClause = season;
		delete p.transferOffers;
		delete p.transferListed;
		delete p.loanListed;
		player.addToFreeAgents(p, numPlayersTradedAwayNormalized);
		await idb.cache.players.put(p);
	}

	return picked.map(({ p }) => p);
};
