import { PHASE } from "../../../common/constants.ts";
import type { GameAttributesLeague } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, logEvent } from "../../util/index.ts";
import { describeClubStature } from "./clubStature.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import {
	detectCountryStories,
	type WorldStory,
	type WorldStoryClub,
	writeWorldStory,
} from "./worldStories.ts";

/**
 * A story's news score: the user's Country's stories in full, and the rest of
 * the World's as a digest (decided with the user), so they show up among big
 * news only when they're big
 */
export const getStoryScore = (story: WorldStory, userCountryId?: number) =>
	Math.round(
		(story.countryId === userCountryId ? 0.5 : 0.25) * story.significance,
	);

/**
 * International Soccer Zen GM mod (storytelling): find the stories a finished
 * season told in each Country (see competition/worldStories.ts) and save them
 * as "story" news items. A season that already has stories isn't done again.
 */
export const recordWorldStories = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const existing = await idb.getCopies.events({ season }, "noCopyCache");
	if (existing.some((event) => event.type === "story")) {
		return;
	}

	const divisionsById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);
	const userTid = g.get("userTid");
	const teamSeasonsByTid = new Map(
		(await idb.getCopies.teamSeasons({ season }, "noCopyCache")).map(
			(teamSeason) => [teamSeason.tid, teamSeason],
		),
	);
	const clubs: WorldStoryClub[] = [];
	let userCountryId: number | undefined;
	for (const t of await idb.cache.teams.getAll()) {
		const history = t.worldHistory ?? [];
		const entry = history.find((row) => row.season === season);
		const division = entry ? divisionsById.get(entry.divisionId) : undefined;
		if (t.disabled || !entry || !division) {
			continue;
		}
		if (t.tid === userTid) {
			userCountryId = division.countryId;
		}

		// Its stature going into the season: after the season before, or from
		// its seed
		// An earlier season's team season may only be in the database
		const teamSeason = teamSeasonsByTid.get(t.tid);
		const before = history.filter((row) => row.season < season);
		const statureBefore =
			before.at(-1)?.stature ??
			describeClubStature({
				seed: t.worldStatureSeed,
				history: before,
				tier: entry.tier,
				pop: teamSeason?.pop ?? 1,
				season,
			}).stature;

		clubs.push({
			tid: t.tid,
			countryId: division.countryId,
			history,
			statureBefore,
			runs: teamSeason?.worldSeason?.runs ?? teamSeason?.worldRuns,
			town: t.location?.town,
		});
	}

	const stories = structure.countries.flatMap((country) =>
		detectCountryStories({
			season,
			countryId: country.countryId,
			divisions: structure.competitionDivisions,
			clubs,
		}),
	);

	for (const story of stories) {
		const event = {
			type: "story" as const,
			text: writeWorldStory(story, (tid) => `the ${teamLink(tid)}`).replace(
				/^the /,
				"The ",
			),
			tids: story.tids,
			score: getStoryScore(story, userCountryId),
			story: {
				kind: story.kind,
				countryId: story.countryId,
				...(story.divisionId !== undefined
					? { divisionId: story.divisionId }
					: {}),
				significance: story.significance,
				facts: story.facts,
			},
		};
		if (season === g.get("season")) {
			await logEvent({
				...event,
				showNotification: story.tids[0] === userTid,
			});
		} else {
			await idb.cache.events.add({ ...event, season });
		}
	}
};

/**
 * International Soccer Zen GM mod (storytelling): a World made before season
 * stories finds the stories of every season it has recorded, once, when it
 * loads
 */
export const fillWorldStories = async () => {
	const structure = getCompetitionStructure();
	if (
		isSingleDivision(structure) ||
		(g as unknown as Partial<GameAttributesLeague>).worldStoriesFilled
	) {
		return;
	}

	const lastFinishedSeason =
		g.get("phase") > PHASE.PLAYOFFS ? g.get("season") : g.get("season") - 1;
	for (
		let season = g.get("startingSeason");
		season <= lastFinishedSeason;
		season++
	) {
		await recordWorldStories(season);
	}

	await idb.cache.gameAttributes.put({
		key: "worldStoriesFilled",
		value: true,
	});
	g.setWithoutSavingToDB("worldStoriesFilled", true);
};
