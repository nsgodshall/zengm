import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getWorldSeasonSummary } from "./seasonSummary.ts";
import {
	getRecentForm,
	getTableZones,
	orderDivisionsForDisplay,
} from "./leagueTableInfo.ts";

const NUM_FORM_GAMES = 5;

/**
 * International Soccer Zen GM mod (Epic 6): everything the league table pages
 * need for one season of a World: a table per Division, in the order to show
 * them (the user's Division first, see orderDivisionsForDisplay), with each
 * club's record, recent form, and the promotion/relegation zone its position
 * is in, and once the season is over, whether it was actually promoted or
 * relegated. Undefined outside a World.
 */
const getWorldTables = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const tables = await getDivisionTables(season);

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: [
				"abbrev",
				"region",
				"name",
				"imgURL",
				"imgURLSmall",
				"divisionId",
			],
			season,
			showNoStats: true,
		},
		"noCopyCache",
	);
	const teamByTid = new Map(teams.map((t) => [t.tid, t]));

	const games = (await idb.getCopies.games({ season }, "noCopyCache")).filter(
		(game) => !game.playoffs,
	);

	const countryNameById = new Map(
		structure.countries.map((country) => [country.countryId, country.name]),
	);

	const userDivisionId = teamByTid.get(g.get("userTid"))?.seasonAttrs
		.divisionId;

	// Epic 8: once the season is over, which clubs actually went up or down
	const seasonOver =
		season < g.get("season") || g.get("phase") > PHASE.PLAYOFFS;
	const resultByTid = new Map<
		number,
		"promoted" | "promotedViaPlayoff" | "relegated"
	>();
	if (seasonOver) {
		for (const country of (await getWorldSeasonSummary(season)) ?? []) {
			for (const division of country.divisions) {
				for (const { tid, viaPlayoff } of division.promoted) {
					resultByTid.set(tid, viaPlayoff ? "promotedViaPlayoff" : "promoted");
				}
				for (const tid of division.relegated) {
					resultByTid.set(tid, "relegated");
				}
			}
		}
	}

	const divisions = orderDivisionsForDisplay(structure, userDivisionId).map(
		(division) => {
			const table = tables[division.divisionId] ?? [];
			const zones = getTableZones(structure, division.divisionId, table.length);

			return {
				divisionId: division.divisionId,
				name: division.name,
				tier: division.tier,
				countryId: division.countryId,
				countryName: countryNameById.get(division.countryId) ?? "",
				rows: table.map((row, i) => {
					const t = teamByTid.get(row.tid);
					return {
						tid: row.tid,
						rank: row.rank,
						abbrev: t?.seasonAttrs.abbrev ?? "",
						region: t?.seasonAttrs.region ?? "",
						name: t?.seasonAttrs.name ?? "",
						imgURL: t?.seasonAttrs.imgURL ?? "",
						imgURLSmall: t?.seasonAttrs.imgURLSmall,
						played: row.won + row.lost + row.tied,
						won: row.won,
						tied: row.tied,
						lost: row.lost,
						scored: row.scored,
						conceded: row.scored - row.pointDiff,
						pointDiff: row.pointDiff,
						points: row.points,
						pointsDeduction: row.pointsDeduction,
						form: getRecentForm(games, row.tid, NUM_FORM_GAMES),
						zone: zones[i],
						result: resultByTid.get(row.tid),
					};
				}),
			};
		},
	);

	return {
		divisions,
		// A Division's champion is only decided once the regular season is over
		seasonOver,
		userDivisionId,
	};
};

export default getWorldTables;
