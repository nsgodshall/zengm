import { bySport } from "../../../common/sportFunctions.ts";
import type { Conditions, Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, logEvent } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getScorerValue } from "./recordWorldSeason.ts";
import { getStoryScore } from "./recordWorldStories.ts";
import {
	couldBeALegend,
	describeRetirement,
	getMainClub,
	getRetirementStory,
	type RetiringPlayer,
} from "./retirementStories.ts";
import teamLink from "./teamLink.ts";

// What a club's scoring stat is called in its stories
const SCORING_NAME = bySport({
	baseball: "home runs",
	basketball: "points",
	football: "touchdowns",
	hockey: "goals",
});

/** A player's regular season appearances and scoring at each club he played for */
const getByTid = (stats: Record<string, any>[]) => {
	const byTid = new Map<number, RetiringPlayer["byTid"][number]>();
	for (const row of stats) {
		if (row.playoffs || !(row.gp > 0) || row.tid < 0) {
			continue;
		}
		const club = byTid.get(row.tid) ?? {
			tid: row.tid,
			gp: 0,
			value: 0,
			firstSeason: row.season,
			lastSeason: row.season,
		};
		club.gp += row.gp;
		club.value += getScorerValue(row) || 0;
		club.firstSeason = Math.min(club.firstSeason, row.season);
		club.lastSeason = Math.max(club.lastSeason, row.season);
		byTid.set(row.tid, club);
	}
	return [...byTid.values()];
};

/**
 * International Soccer Zen GM mod (storytelling, Phase 4): the story of every
 * club legend who retired this summer (see competition/retirementStories.ts).
 * Run after the annual retirement check, with the players it retired: they've
 * left the cache by then, so they're passed in.
 */
export const recordRetirementStories = async (
	retired: Player[],
	conditions?: Conditions,
) => {
	const structure = getCompetitionStructure();
	if (retired.length === 0 || isSingleDivision(structure)) {
		return;
	}

	const season = g.get("season");

	const userTid = g.get("userTid");
	const divisionsById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);
	const teams = await idb.cache.teams.getAll();
	const teamsByTid = new Map(teams.map((t) => [t.tid, t]));
	const userCountryId = divisionsById.get(
		teamsByTid.get(userTid)?.divisionId ?? -1,
	)?.countryId;

	// A club's all-time bests, worked out once for all of its retiring legends
	const bestsByTid = new Map<
		number,
		{ mostAppearances: number; mostScoring: number }
	>();
	const getClubBests = async (tid: number) => {
		const cached = bestsByTid.get(tid);
		if (cached) {
			return cached;
		}
		const bests = { mostAppearances: 0, mostScoring: 0 };
		for (const p of await idb.getCopies.players({ statsTid: tid })) {
			let gp = 0;
			let value = 0;
			for (const row of p.stats) {
				if (row.tid === tid && !row.playoffs && row.gp > 0) {
					gp += row.gp;
					value += getScorerValue(row as any) || 0;
				}
			}
			bests.mostAppearances = Math.max(bests.mostAppearances, gp);
			bests.mostScoring = Math.max(bests.mostScoring, value);
		}
		bestsByTid.set(tid, bests);
		return bests;
	};

	for (const p of retired) {
		const byTid = getByTid(p.stats);
		if (byTid.length === 0) {
			continue;
		}

		const player: RetiringPlayer = {
			pid: p.pid,
			name: `${p.firstName} ${p.lastName}`,
			age: season - p.born.year,
			byTid,
			statsTids: p.statsTids,
			academyTids: (p.transactions ?? [])
				.filter((transaction) => transaction.type === "academy")
				.map((transaction) => transaction.tid),
		};
		const main = getMainClub(player);
		const t = main ? teamsByTid.get(main.tid) : undefined;
		const division =
			t?.divisionId === undefined ? undefined : divisionsById.get(t.divisionId);
		if (!main || !t || !division) {
			continue;
		}

		// A Division's season is as long as its size makes it
		const gamesPerSeason = division.numGames ?? g.get("numGames");
		if (!couldBeALegend(player, gamesPerSeason)) {
			continue;
		}

		const facts = getRetirementStory({
			player,
			club: {
				...(await getClubBests(main.tid)),
				titleSeasons: (t.worldHistory ?? [])
					.filter((entry) => entry.champion)
					.map((entry) => entry.season),
			},
			gamesPerSeason,
		});
		if (!facts) {
			continue;
		}

		const story = {
			kind: "legendRetires" as const,
			countryId: division.countryId,
			divisionId: division.divisionId,
			significance: facts.significance,
			facts: {
				pid: facts.pid,
				gp: facts.gp,
				value: facts.value,
				titles: facts.titles,
				oneClub: String(facts.oneClub),
				academy: String(facts.academy),
				leader: facts.leader.join(", "),
			},
		};
		await logEvent(
			{
				type: "story",
				text: describeRetirement({
					facts,
					club: `the ${teamLink(t.tid)}`,
					scoring: SCORING_NAME,
				}),
				pids: [p.pid],
				tids: [t.tid],
				score: getStoryScore(story, userCountryId),
				showNotification: t.tid === userTid,
				hideInLiveGame: true,
				story,
			},
			conditions,
		);
	}
};
