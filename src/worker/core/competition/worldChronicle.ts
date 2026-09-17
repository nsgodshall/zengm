import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { describeClubStature } from "./clubStature.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import {
	getSeasonStorylines,
	type StorylineClub,
	writeStoryline,
} from "./seasonStorylines.ts";
import teamLink from "./teamLink.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/**
 * International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
 * 5): a finished season across a World, Country by Country with the user's
 * first: its stories, most significant first, and each Division's champion and
 * who went up and down, from clubs' saved histories. Undefined outside a World.
 */
export const getWorldChronicle = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const teams = await idb.cache.teams.getAll();
	const teamInfoCache = g.get("teamInfoCache");
	const club = (tid: number) => ({
		tid,
		abbrev: teamInfoCache[tid]?.abbrev ?? "???",
		region: teamInfoCache[tid]?.region ?? "",
		name: teamInfoCache[tid]?.name ?? "",
		imgURL: teamInfoCache[tid]?.imgURL,
		imgURLSmall: teamInfoCache[tid]?.imgURLSmall,
	});

	const entries = teams.flatMap((t) =>
		(t.worldHistory ?? [])
			.filter((entry) => entry.season === season)
			.map((entry) => ({ tid: t.tid, entry })),
	);

	const events = await idb.getCopies.events({ season }, "noCopyCache");
	const stories = events
		.flatMap((event) =>
			event.type === "story" && "story" in event && event.story
				? [{ eid: event.eid, text: event.text ?? "", ...event.story }]
				: [],
		)
		.sort((a, b) => b.significance - a.significance);

	const userTid = g.get("userTid");
	const userDivisionId = teams.find((t) => t.tid === userTid)?.divisionId;
	const userCountryId = structure.competitionDivisions.find(
		(division) => division.divisionId === userDivisionId,
	)?.countryId;

	const countries = structure.countries.map((country) => {
		const divisions = structure.competitionDivisions
			.filter((division) => division.countryId === country.countryId)
			.sort((a, b) => a.tier - b.tier)
			.map((division) => {
				const divisionEntries = entries.filter(
					({ entry }) => entry.divisionId === division.divisionId,
				);
				const champion = divisionEntries.find(({ entry }) => entry.champion);
				return {
					divisionId: division.divisionId,
					name: division.name,
					tier: division.tier,
					champion: champion
						? { ...club(champion.tid), points: champion.entry.points }
						: undefined,
					promoted: divisionEntries
						.filter(({ entry }) => entry.moved === "promoted")
						.map(({ tid, entry }) => ({
							...club(tid),
							viaPlayoff: entry.promotionPlayoff === "won",
						})),
					relegated: divisionEntries
						.filter(({ entry }) => entry.moved === "relegated")
						.map(({ tid }) => club(tid)),
				};
			});

		return {
			countryId: country.countryId,
			name: country.name,
			flag: country.flag,
			divisions,
			stories: stories
				.filter((story) => story.countryId === country.countryId)
				.map((story) => ({
					eid: story.eid,
					kind: story.kind,
					significance: story.significance,
					text: story.text,
				})),
		};
	});

	return {
		season,
		hasSeason: entries.length > 0,
		countries: [
			...countries.filter((country) => country.countryId === userCountryId),
			...countries.filter((country) => country.countryId !== userCountryId),
		],
	};
};

/**
 * International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
 * 5): each Country's storylines for a season's Season Preview (see
 * competition/seasonStorylines.ts), the user's Country first, from clubs'
 * Divisions that season, their saved histories and stature, and `ovrByTid`,
 * their squads' strength going in. Undefined outside a World.
 */
export const getWorldStorylines = async (
	season: number,
	ovrByTid: Map<number, number>,
) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const divisionsById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);
	const teamSeasons = await idb.getCopies.teamSeasons(
		{ season },
		"noCopyCache",
	);
	const userTid = g.get("userTid", season);
	let userCountryId: number | undefined;
	const clubs: StorylineClub[] = [];
	for (const t of await idb.cache.teams.getAll()) {
		const teamSeason = teamSeasons.find((row) => row.tid === t.tid);
		const division =
			teamSeason?.divisionId === undefined
				? undefined
				: divisionsById.get(teamSeason.divisionId);
		if (t.disabled || !teamSeason || !division) {
			continue;
		}
		if (t.tid === userTid) {
			userCountryId = division.countryId;
		}
		const history = (t.worldHistory ?? []).filter(
			(entry) => entry.season < season,
		);
		clubs.push({
			tid: t.tid,
			countryId: division.countryId,
			town: t.location?.town,
			divisionId: division.divisionId,
			tier: division.tier,
			stature:
				history.at(-1)?.stature ??
				describeClubStature({
					seed: t.worldStatureSeed,
					history,
					tier: division.tier,
					pop: teamSeason.pop,
					season,
				}).stature,
			ovr: ovrByTid.get(t.tid) ?? 0,
			history,
		});
	}

	const countries = structure.countries.map((country) => ({
		countryId: country.countryId,
		name: country.name,
		storylines: getSeasonStorylines({
			season,
			countryId: country.countryId,
			divisions: structure.competitionDivisions,
			clubs,
		}).map((storyline) => ({
			kind: storyline.kind,
			text: writeStoryline(storyline, (tid) => `the ${teamLink(tid)}`).replace(
				/^the /,
				"The ",
			),
		})),
	}));

	return [
		...countries.filter((country) => country.countryId === userCountryId),
		...countries.filter((country) => country.countryId !== userCountryId),
	];
};
