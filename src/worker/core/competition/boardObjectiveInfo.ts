import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { team } from "../index.ts";
import {
	BOARD_OBJECTIVE_LABELS,
	type BoardObjective,
	getBoardObjective,
	getBoardObjectiveMoodDeltas,
} from "./boardObjectives.ts";
import {
	type CompetitionStructure,
	isSingleDivision,
} from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getFanExpectation } from "./fanExpectations.ts";
import { getClubDivisionInfo } from "./leagueHistory.ts";

// A squad's strength, the same team rating as the team page and power rankings
// but with true ratings, since the board knows its players
const getSquadOvr = async (tid: number) => {
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	const playersPlus = await idb.getCopies.playersPlus(players, {
		attrs: ["pid", "injury", "value"],
		ratings: ["ovr", "pos", "ovrs"],
		season: g.get("season"),
		showNoStats: true,
		showRookies: true,
	});
	return team.ovr(playersPlus);
};

const getZoneSizes = (structure: CompetitionStructure, divisionId: number) => {
	const upper = structure.promotionRelegationLinks.find(
		(link) => link.lowerDivisionId === divisionId,
	);
	const lower = structure.promotionRelegationLinks.find(
		(link) => link.upperDivisionId === divisionId,
	);
	return {
		topTier: !upper,
		numAutoPromoted: upper?.numAutoPromoted ?? 0,
		numPromotionPlayoffTeams:
			upper && upper.numPromotionPlayoffSpots > 0
				? upper.numPromotionPlayoffTeams
				: 0,
		numRelegated: lower?.numAutoRelegated ?? 0,
	};
};

/**
 * International Soccer Zen GM mod (Epic 6): sets the current season's board
 * objective (see getBoardObjective) for every club in a World that doesn't have
 * one yet, from its squad's strength rank in its Division. Run when the regular
 * season starts, so it goes by the squads clubs start the season with.
 */
export const ensureBoardObjectives = async () => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const season = g.get("season");
	const teamSeasons = await idb.getCopies.teamSeasons(
		{ season },
		"noCopyCache",
	);
	if (teamSeasons.every((row) => row.boardObjective)) {
		return;
	}

	for (const division of structure.competitionDivisions) {
		const tids = teamSeasons
			.filter((row) => row.divisionId === division.divisionId)
			.map((row) => row.tid);
		const ovrs = new Map<number, number>();
		for (const tid of tids) {
			ovrs.set(tid, await getSquadOvr(tid));
		}
		tids.sort((a, b) => ovrs.get(b)! - ovrs.get(a)! || a - b);

		const zoneSizes = getZoneSizes(structure, division.divisionId);
		for (const [i, tid] of tids.entries()) {
			const teamSeason = await idb.cache.teamSeasons.indexGet(
				"teamSeasonsBySeasonTid",
				[season, tid],
			);
			if (teamSeason && !teamSeason.boardObjective) {
				teamSeason.boardObjective = getBoardObjective({
					strengthRank: i + 1,
					numClubs: tids.length,
					...zoneSizes,
				});
				await idb.cache.teamSeasons.put(teamSeason);
			}
		}
	}
};

const describeObjective = (objective: BoardObjective) =>
	`${BOARD_OBJECTIVE_LABELS[objective.kind]} (${helpers.ordinal(
		objective.targetPosition,
	)} or better)`;

/**
 * International Soccer Zen GM mod (Epic 6): a club's board objective for a
 * season and its place in its Division table so far, for the dashboard and team
 * page. Undefined outside a World, and before the regular season starts. A
 * World made before board objectives gets them the first time they're shown.
 */
export const getBoardObjectiveInfo = async (tid: number, season: number) => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const phase = g.get("phase");
	if (season === g.get("season")) {
		// Before the regular season, the board hasn't set its objective yet
		if (phase < PHASE.REGULAR_SEASON) {
			return;
		}
		if (phase <= PHASE.PLAYOFFS) {
			await ensureBoardObjectives();
		}
	}

	const teamSeason = await idb.getCopy.teamSeasons({ tid, season });
	if (!teamSeason?.boardObjective) {
		return;
	}

	const divisionInfo = await getClubDivisionInfo(tid, season);

	// Storytelling (Phase 5): what the club's own history has the fans expecting
	const structure = getCompetitionStructure();
	const t = await idb.cache.teams.get(tid);
	const countryId = structure.competitionDivisions.find(
		(division) => division.divisionId === divisionInfo?.divisionId,
	)?.countryId;
	const topDivisionName =
		structure.competitionDivisions.find(
			(division) => division.countryId === countryId && division.tier === 1,
		)?.name ?? "";
	const fans =
		divisionInfo && t
			? getFanExpectation({
					history: (t.worldHistory ?? []).filter(
						(entry) => entry.season < season,
					),
					tier: divisionInfo.tier,
					divisionName: divisionInfo.divisionName,
					topDivisionName,
				})
			: undefined;

	return {
		text: describeObjective(teamSeason.boardObjective),
		fans,
		targetPosition: teamSeason.boardObjective.targetPosition,
		position:
			divisionInfo && divisionInfo.played > 0
				? divisionInfo.position
				: undefined,
		seasonOver: season < g.get("season") || phase > PHASE.PLAYOFFS,
	};
};

/**
 * International Soccer Zen GM mod (Epic 6): how a club did against its board
 * objective in a season that just ended, after promotion and relegation: the
 * owner mood changes (see getBoardObjectiveMoodDeltas) and a sentence for the
 * owner's message. Undefined outside a World.
 */
export const evaluateBoardObjective = async (tid: number, season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	if (season === g.get("season")) {
		await ensureBoardObjectives();
	}

	const teamSeason = await idb.getCopy.teamSeasons({ tid, season });
	const t = await idb.cache.teams.get(tid);
	const divisionInfo = await getClubDivisionInfo(tid, season);
	if (!teamSeason?.boardObjective || !t || !divisionInfo) {
		return;
	}

	// The season's moves are done, so the team is in next season's Division
	const tierByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	const tier = divisionInfo.tier;
	const nextTier =
		(t.divisionId === undefined
			? undefined
			: tierByDivisionId.get(t.divisionId)) ?? tier;
	const outcome =
		nextTier < tier
			? "promoted"
			: nextTier > tier
				? "relegated"
				: tier === 1 && divisionInfo.position === 1
					? "champion"
					: undefined;

	const { targetPosition } = teamSeason.boardObjective;
	const deltas = getBoardObjectiveMoodDeltas({
		targetPosition,
		position: divisionInfo.position,
		numClubs: divisionInfo.numClubs,
		outcome,
	});

	const label = BOARD_OBJECTIVE_LABELS[teamSeason.boardObjective.kind];
	let text = `The board's objective this season was to ${label.charAt(0).toLowerCase()}${label.slice(1)} (${helpers.ordinal(
		targetPosition,
	)} or better). You finished ${helpers.ordinal(divisionInfo.position)} in the ${
		divisionInfo.divisionName
	}, so you ${divisionInfo.position <= targetPosition ? "met" : "missed"} it.`;
	if (outcome === "champion") {
		text += ` Winning the ${divisionInfo.countryName} title is a big bonus.`;
	} else if (outcome === "promoted") {
		text += " Winning promotion is a big bonus.";
	} else if (outcome === "relegated") {
		text += " Relegation is a big blow.";
	}

	return {
		...deltas,
		text,
	};
};
