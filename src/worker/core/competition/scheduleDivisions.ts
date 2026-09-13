import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { orderDivisionsForDisplay } from "./leagueTableInfo.ts";

/**
 * International Soccer Zen GM mod (Epic 6): which Division each club played in
 * during a season, and the order to show Divisions in (the user's first, see
 * orderDivisionsForDisplay), for grouping a World's schedule by Division.
 * Undefined outside a World.
 */
const getScheduleDivisions = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: ["divisionId"],
			season,
			showNoStats: true,
		},
		"noCopyCache",
	);

	const divisionIdByTid: Record<number, number> = {};
	for (const t of teams) {
		if (t.seasonAttrs.divisionId !== undefined) {
			divisionIdByTid[t.tid] = t.seasonAttrs.divisionId;
		}
	}

	const countryNameById = new Map(
		structure.countries.map((country) => [country.countryId, country.name]),
	);

	return {
		divisionIdByTid,
		divisions: orderDivisionsForDisplay(
			structure,
			divisionIdByTid[g.get("userTid")],
		).map((division) => ({
			divisionId: division.divisionId,
			name: division.name,
			countryName: countryNameById.get(division.countryId) ?? "",
		})),
	};
};

export default getScheduleDivisions;
