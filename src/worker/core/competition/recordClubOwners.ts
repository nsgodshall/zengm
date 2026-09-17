import type { Conditions } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import {
	getAdministrationDeduction,
	getNextOwner,
	isInAdministration,
	getOwnerFunding,
	getTakeoverChance,
	OWNER_KIND_LABELS,
} from "./clubOwners.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";

/**
 * International Soccer Zen GM mod (storytelling, Phase 6c): each summer, clubs
 * change hands, benefactors put their money in, and their interest runs out
 * (see competition/clubOwners.ts). Run after promotion and relegation, so a
 * club's new tier counts. Also gives an owner to any club without one.
 */
export const updateClubOwners = async (
	season: number,
	conditions?: Conditions,
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

	for (const t of await idb.cache.teams.getAll()) {
		if (t.disabled) {
			continue;
		}
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[t.tid, season],
		);
		if (!teamSeason) {
			continue;
		}

		const revenue = Object.values(teamSeason.revenues).reduce(
			(sum, amount) => sum + amount,
			0,
		);
		const record = teamSeason.worldSeason;
		// Storytelling (Phase 6c): a club whose debt is past what its owner will
		// cover goes into administration: its debts are written off, it loses
		// points next season, and someone else takes it on
		const administration = isInAdministration({
			cash: teamSeason.cash,
			revenue,
			owner: t.worldOwner,
		});
		if (administration) {
			const division = structure.competitionDivisions.find(
				(division) => division.divisionId === t.divisionId,
			);
			const points = getAdministrationDeduction({
				numGames: division?.numGames ?? g.get("numGames"),
				winPoints: division?.winPoints ?? 3,
			});
			t.worldPointsDeductions = [
				...(t.worldPointsDeductions ?? []),
				{ season: season + 1, points },
			];
			teamSeason.cash = 0;
			await idb.cache.teamSeasons.put(teamSeason);

			logEvent(
				{
					type: "story",
					text: `The ${teamLink(t.tid)} have gone into administration. Their debts are written off, and they start next season on -${points} points.`,
					tids: [t.tid],
					score: 30,
					showNotification: t.tid === g.get("userTid"),
					hideInLiveGame: true,
					story: {
						kind: "administration",
						countryId: division?.countryId ?? 0,
						significance: 60,
						facts: { points },
					},
				},
				conditions,
			);
		}

		const takeover =
			administration ||
			(t.worldOwner !== undefined &&
				Math.random() <
					getTakeoverChance({
						stature: t.worldStature ?? 45,
						tier:
							(t.divisionId === undefined
								? undefined
								: tierByDivisionId.get(t.divisionId)) ?? 1,
						cash: teamSeason.cash,
						revenue,
						champion: record?.champion === true,
					}));

		const { owner, change } = getNextOwner({
			owner: t.worldOwner,
			season: season + 1,
			revenue,
			takeover,
			random: Math.random,
		});
		t.worldOwner = owner;

		// The owner's money arrives for next season
		const funding = getOwnerFunding(owner);
		if (funding > 0) {
			teamSeason.cash += funding;
			await idb.cache.teamSeasons.put(teamSeason);
		}

		await idb.cache.teams.put(t);

		if (change === "takeover") {
			const money =
				funding > 0
					? ` They're putting in ${helpers.formatCurrency(funding / 1000, "M")} a season.`
					: "";
			logEvent(
				{
					type: "story",
					text: `The ${teamLink(t.tid)} have been bought by ${
						owner.kind === "fanOwned"
							? "their supporters"
							: `a${owner.kind === "investmentGroup" ? "n" : ""} ${OWNER_KIND_LABELS[owner.kind].toLowerCase()}`
					}.${money}`,
					tids: [t.tid],
					score: funding > 0 ? 25 : 15,
					showNotification: t.tid === g.get("userTid"),
					hideInLiveGame: true,
					story: {
						kind: "takeover",
						countryId:
							structure.competitionDivisions.find(
								(division) => division.divisionId === t.divisionId,
							)?.countryId ?? 0,
						significance: funding > 0 ? 50 : 30,
						facts: { owner: owner.kind, funding },
					},
				},
				conditions,
			);
		} else if (change === "fundingOver") {
			logEvent(
				{
					type: "story",
					text: `The ${teamLink(t.tid)}' owner has stopped putting money in, so they live on what they earn from now on.`,
					tids: [t.tid],
					score: 20,
					showNotification: t.tid === g.get("userTid"),
					hideInLiveGame: true,
					story: {
						kind: "ownerFundingOver",
						countryId:
							structure.competitionDivisions.find(
								(division) => division.divisionId === t.divisionId,
							)?.countryId ?? 0,
						significance: 40,
						facts: { owner: owner.kind },
					},
				},
				conditions,
			);
		}
	}
};
