import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { describeClubStature } from "./clubStature.ts";
import { getOwnerFunding, OWNER_KIND_LABELS } from "./clubOwners.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getTransferFunds } from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";

/**
 * International Soccer Zen GM mod (Epic 6): a World club's facts for its team
 * page, like a Football Manager club overview: its stadium, how its market
 * compares to the rest of its Country's clubs, and its money. Money is in
 * millions of dollars, and transfer funds (see getTransferFunds) are only for
 * the current season. Undefined outside a World.
 */
export const getClubInfo = async (tid: number, season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teamSeasons = await idb.getCopies.teamSeasons(
		{ season },
		"noCopyCache",
	);
	const teamSeason = teamSeasons.find((row) => row.tid === tid);
	if (!teamSeason) {
		return;
	}

	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const getCountryId = (divisionId: number | undefined) =>
		divisionId === undefined
			? undefined
			: countryIdByDivisionId.get(divisionId);
	const countryId = getCountryId(teamSeason.divisionId);
	const countryClubs = teamSeasons.filter(
		(row) => getCountryId(row.divisionId) === countryId,
	);

	let transferFunds;
	if (season === g.get("season")) {
		const wageBudget = (await getWageBudgets()).get(tid) ?? 0;
		transferFunds =
			getTransferFunds({ cash: teamSeason.cash, wageBudget }) / 1000;
	}

	// Storytelling: how big the club is going into the season (see
	// competition/clubStature.ts)
	const t = await idb.cache.teams.get(tid);
	const stature = t
		? describeClubStature({
				seed: t.worldStatureSeed,
				history: (t.worldHistory ?? []).filter(
					(entry) => entry.season < season,
				),
				tier:
					structure.competitionDivisions.find(
						(division) => division.divisionId === teamSeason.divisionId,
					)?.tier ?? 1,
				pop: teamSeason.pop,
				season,
			})
		: undefined;

	return {
		owner: t?.worldOwner
			? {
					label: OWNER_KIND_LABELS[t.worldOwner.kind],
					since: t.worldOwner.since,
					funding: getOwnerFunding(t.worldOwner) / 1000,
				}
			: undefined,
		founded: t?.worldIdentity?.founded,
		nickname: t?.worldIdentity?.nickname,
		stature: stature?.stature,
		statureLabel: stature?.label,
		stadiumCapacity: teamSeason.stadiumCapacity,
		pop: teamSeason.pop,
		marketRank:
			countryClubs.filter((row) => row.pop > teamSeason.pop).length + 1,
		numClubsInCountry: countryClubs.length,
		countryName:
			structure.countries.find((country) => country.countryId === countryId)
				?.name ?? "",
		cash: teamSeason.cash / 1000,
		transferFunds,
	};
};
