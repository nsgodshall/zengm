import type { GameAttributesLeague, Team } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { describeClubEra, getClubEras } from "./clubEras.ts";
import { getClubHonours } from "./clubHonours.ts";
import { describeClubStature } from "./clubStature.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import {
	getDerbyTown,
	getLastMeeting,
	getRivalries,
	isRivalryRenewed,
	type Rival,
	type RivalryReason,
} from "./rivalries.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

// A club's stature after its latest finished season, with this season's market
// size
const getCurrentStature = async (
	t: Team,
	structure: ReturnType<typeof getCompetitionStructure>,
) => {
	const teamSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsByTidSeason",
		[t.tid, g.get("season")],
	);
	if (!teamSeason) {
		return;
	}
	return describeClubStature({
		seed: t.worldStatureSeed,
		history: t.worldHistory ?? [],
		tier:
			structure.competitionDivisions.find(
				(division) => division.divisionId === t.divisionId,
			)?.tier ?? 1,
		pop: teamSeason.pop,
		season: g.get("season"),
	});
};

/**
 * International Soccer Zen GM mod (storytelling): a World club's honours and
 * every season it has finished, with Division names, for its history page.
 * Undefined outside a World.
 */
export const getClubHonoursInfo = async (tid: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const t = await idb.cache.teams.get(tid);
	if (!t) {
		return;
	}

	const divisionName = (divisionId: number | undefined) =>
		structure.competitionDivisions.find(
			(division) => division.divisionId === divisionId,
		)?.name ?? "";
	const teamInfoCache = g.get("teamInfoCache");
	const honours = getClubHonours(t.worldHistory ?? []);
	const recordSigning = t.worldRecordSigning;
	const stature = await getCurrentStature(t, structure);

	return {
		...honours,
		stature: stature?.stature,
		statureLabel: stature?.label,
		// Storytelling (Phase 5): the club's spells in each tier, oldest first
		eras: getClubEras(t.worldHistory ?? []).map((era) =>
			describeClubEra({ era, divisionName: divisionName(era.divisionId) }),
		),
		titles: honours.titles.map((row) => ({
			...row,
			divisionName: divisionName(row.divisionId),
		})),
		seasonsByTier: honours.seasonsByTier.map((row) => ({
			...row,
			divisionName: divisionName(row.divisionId),
		})),
		bestFinish: honours.bestFinish
			? {
					...honours.bestFinish,
					divisionName: divisionName(honours.bestFinish.divisionId),
				}
			: undefined,
		recordSigning: recordSigning
			? {
					...recordSigning,
					sellerAbbrev: teamInfoCache[recordSigning.sellerTid]?.abbrev,
					sellerRegion: teamInfoCache[recordSigning.sellerTid]?.region,
				}
			: undefined,
		seasons: (t.worldHistory ?? []).map((entry) => ({
			...entry,
			divisionName: divisionName(entry.divisionId),
		})),
	};
};

/**
 * International Soccer Zen GM mod (storytelling): every World club's honours in
 * short, for the Team Records page, counting only seasons that pass
 * `includeSeason` (like the seasons the user ran the club). Undefined outside a
 * World.
 */
export const getClubRecordsHonours = async (
	includeSeason: (tid: number, season: number) => boolean,
) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const summaries = new Map<
		number,
		{
			topTierSeasons: number;
			titles: number;
			lastTitle: number | undefined;
			lowerTitles: number;
			promotions: number;
			relegations: number;
			stature: number | undefined;
			bestFinish: { tier: number; position: number } | undefined;
		}
	>();
	for (const t of await idb.cache.teams.getAll()) {
		const stature = await getCurrentStature(t, structure);
		const honours = getClubHonours(
			(t.worldHistory ?? []).filter((entry) =>
				includeSeason(t.tid, entry.season),
			),
		);
		const topTitles = honours.titles.find((row) => row.tier === 1);
		summaries.set(t.tid, {
			topTierSeasons:
				honours.seasonsByTier.find((row) => row.tier === 1)?.seasons ?? 0,
			titles: topTitles?.seasons.length ?? 0,
			lastTitle: topTitles?.seasons.at(-1),
			lowerTitles: honours.titles
				.filter((row) => row.tier !== 1)
				.reduce((sum, row) => sum + row.seasons.length, 0),
			promotions: honours.promotions.length,
			relegations: honours.relegations.length,
			stature: stature?.stature,
			bestFinish: honours.bestFinish
				? {
						tier: honours.bestFinish.tier,
						position: honours.bestFinish.position,
					}
				: undefined,
		});
	}
	return summaries;
};

/**
 * International Soccer Zen GM mod (storytelling): a World club's rivals (see
 * competition/rivalries.ts), with why they're rivals and their all-time
 * regular season record against each. Undefined outside a World.
 */
/** Every World club's rivals, keyed by tid (see competition/rivalries.ts) */
export const getWorldRivalries = async () => {
	const structure = getCompetitionStructure();
	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	return getRivalries({
		season: g.get("season"),
		clubs: teams.flatMap((t) => {
			const countryId =
				t.divisionId === undefined
					? undefined
					: countryIdByDivisionId.get(t.divisionId);
			return countryId === undefined
				? []
				: [
						{
							tid: t.tid,
							countryId,
							town: t.location?.town,
							history: t.worldHistory ?? [],
						},
					];
		}),
		playoffGames:
			(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffResults ??
			[],
	});
};

// The user club's rivals, worked out once a season: game news asks for them
// after every one of its games
let userRivalCache:
	| {
			lid: number;
			season: number;
			tid: number;
			marks: Map<number, { derbyTown?: string }>;
	  }
	| undefined;

/**
 * International Soccer Zen GM mod (storytelling, Phase 5): what the club the
 * user is playing as makes of an opponent, or undefined if they're nothing
 * special to each other. Cached for the season, since game news asks after
 * every game.
 */
export const getUserRivalMark = async (tid: number, opponentTid: number) => {
	const lid = g.get("lid");
	const season = g.get("season");
	if (
		userRivalCache === undefined ||
		userRivalCache.lid !== lid ||
		userRivalCache.season !== season ||
		userRivalCache.tid !== tid
	) {
		userRivalCache = {
			lid,
			season,
			tid,
			marks: await getClubRivalMarks(tid),
		};
	}
	return userRivalCache.marks.get(opponentTid);
};

/**
 * International Soccer Zen GM mod (storytelling, Phase 5): every pair of rival
 * clubs in a World, keyed "lower-higher" by tid, so a day's fixtures can mark
 * the derbies. Empty outside a World.
 */
export type RivalryMark = { derbyTown?: string; lastMet?: number };

// Decided with the user: only a rivalry the clubs are coming back to, not every
// time they play (see isRivalryRenewed)
const getRenewedMark = ({
	rival,
	history,
	historyByTid,
	season,
}: {
	rival: Rival;
	history: { season: number; divisionId: number }[];
	historyByTid: Map<number, { season: number; divisionId: number }[]>;
	season: number;
}): RivalryMark | undefined => {
	const lastMet = getLastMeeting({
		history,
		otherHistory: historyByTid.get(rival.tid) ?? [],
		season,
	});
	if (!isRivalryRenewed({ lastMet, season })) {
		return;
	}

	const derbyTown = getDerbyTown(rival);
	return {
		...(derbyTown === undefined ? {} : { derbyTown }),
		...(lastMet === undefined ? {} : { lastMet }),
	};
};

const getHistoryByTid = async () =>
	new Map(
		(await idb.cache.teams.getAll()).map((t) => [
			t.tid,
			(t.worldHistory ?? []).map((entry) => ({
				season: entry.season,
				divisionId: entry.divisionId,
			})),
		]),
	);

export const getWorldRivalPairs = async () => {
	const pairs = new Map<string, RivalryMark>();
	if (isSingleDivision(getCompetitionStructure())) {
		return pairs;
	}

	const season = g.get("season");
	const historyByTid = await getHistoryByTid();
	for (const [tid, rivals] of await getWorldRivalries()) {
		for (const rival of rivals) {
			const mark = getRenewedMark({
				rival,
				history: historyByTid.get(tid) ?? [],
				historyByTid,
				season,
			});
			if (mark) {
				const key = `${Math.min(tid, rival.tid)}-${Math.max(tid, rival.tid)}`;
				pairs.set(key, mark);
			}
		}
	}
	return pairs;
};

/**
 * International Soccer Zen GM mod (storytelling, Phase 5): who a World club's
 * next opponents are to it, keyed by the opponent's tid, so its schedule can
 * mark the derbies. Empty outside a World.
 */
export const getClubRivalMarks = async (tid: number) => {
	const marks = new Map<number, RivalryMark>();
	if (isSingleDivision(getCompetitionStructure())) {
		return marks;
	}

	const season = g.get("season");
	const historyByTid = await getHistoryByTid();
	for (const rival of (await getWorldRivalries()).get(tid) ?? []) {
		const mark = getRenewedMark({
			rival,
			history: historyByTid.get(tid) ?? [],
			historyByTid,
			season,
		});
		if (mark) {
			marks.set(rival.tid, mark);
		}
	}
	return marks;
};

/**
 * International Soccer Zen GM mod (storytelling): a World club's rivals, with
 * why they're rivals and its all-time record against each, for its history
 * page. Undefined outside a World.
 */
export const getClubRivalsInfo = async (tid: number) => {
	if (isSingleDivision(getCompetitionStructure())) {
		return;
	}

	const rivals = (await getWorldRivalries()).get(tid) ?? [];

	const headToHeads = await idb.getCopies.headToHeads({}, "noCopyCache");
	const teamInfoCache = g.get("teamInfoCache");
	return rivals.map((rival) => {
		const record = { won: 0, lost: 0, tied: 0 };
		const low = Math.min(tid, rival.tid);
		const high = Math.max(tid, rival.tid);
		for (const headToHead of headToHeads) {
			const row = headToHead.regularSeason[low]?.[high];
			if (row) {
				const won = row.won + row.otw;
				const lost = row.lost + row.otl;
				record.won += tid === low ? won : lost;
				record.lost += tid === low ? lost : won;
				record.tied += row.tied;
			}
		}
		const seasons = (kind: RivalryReason["kind"]) =>
			rival.reasons.flatMap((reason) =>
				reason.kind === kind && "season" in reason ? [reason.season] : [],
			);
		return {
			tid: rival.tid,
			abbrev: teamInfoCache[rival.tid]?.abbrev ?? "???",
			region: teamInfoCache[rival.tid]?.region ?? "",
			name: teamInfoCache[rival.tid]?.name ?? "",
			imgURL: teamInfoCache[rival.tid]?.imgURL,
			imgURLSmall: teamInfoCache[rival.tid]?.imgURLSmall,
			derbyTown: getDerbyTown(rival),
			titleRaces: seasons("titleRace"),
			wentUpTogether: seasons("wentUp"),
			wentDownTogether: seasons("wentDown"),
			playoffMeetings: [...new Set(seasons("playoffMeeting"))],
			record,
		};
	});
};
