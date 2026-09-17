import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import type { WorldSeasonRuns } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): a Country's records and its all-time top-tier table, from the season
// records saved on team seasons (see competition/clubSeasonRecords.ts)

export type RecordSeason = {
	tid: number;
	season: number;
	tier: number;
	points: number;
	won: number;
	lost: number;
	tied: number;
	champion?: true;
	runs?: WorldSeasonRuns;
};

export type RecordHolder = {
	tid: number;
	value: number;
	season?: number;
	from?: number;
	to?: number;
	opponentTid?: number;
	text?: string;
};

// The longest run of consecutive seasons on the top tier
const getTopTierRun = (seasons: RecordSeason[], tid: number) => {
	const own = seasons
		.filter((row) => row.tid === tid)
		.sort((a, b) => a.season - b.season);
	let best = { value: 0, from: 0, to: 0 };
	let run = 0;
	let from = 0;
	for (const [i, row] of own.entries()) {
		const previous = own[i - 1];
		if (
			row.tier === 1 &&
			previous?.tier === 1 &&
			previous.season === row.season - 1
		) {
			run += 1;
		} else if (row.tier === 1) {
			run = 1;
			from = row.season;
		} else {
			run = 0;
		}
		if (run > best.value) {
			best = { value: run, from, to: row.season };
		}
	}
	return best;
};

/**
 * A Country's all-time top-tier table and its records. `seasons` is every
 * season record of its clubs.
 */
export const getCountryRecords = ({ seasons }: { seasons: RecordSeason[] }) => {
	const tids = [...new Set(seasons.map((row) => row.tid))];
	const topTier = seasons.filter((row) => row.tier === 1);

	const allTimeTable = tids
		.map((tid) => {
			const own = topTier.filter((row) => row.tid === tid);
			return {
				tid,
				seasons: own.length,
				points: own.reduce((sum, row) => sum + row.points, 0),
				won: own.reduce((sum, row) => sum + row.won, 0),
				lost: own.reduce((sum, row) => sum + row.lost, 0),
				tied: own.reduce((sum, row) => sum + row.tied, 0),
				titles: own.filter((row) => row.champion).length,
			};
		})
		.filter((row) => row.seasons > 0)
		.sort((a, b) => b.points - a.points || b.won - a.won || a.tid - b.tid);

	const best = <T>(
		rows: T[],
		value: (row: T) => number | undefined,
		want: "max" | "min" = "max",
	) => {
		let bestRow: { row: T; value: number } | undefined;
		for (const row of rows) {
			const amount = value(row);
			if (amount === undefined) {
				continue;
			}
			if (
				!bestRow ||
				(want === "max" ? amount > bestRow.value : amount < bestRow.value)
			) {
				bestRow = { row, value: amount };
			}
		}
		return bestRow;
	};
	const seasonRecord = (
		rows: RecordSeason[],
		value: (row: RecordSeason) => number | undefined,
		want: "max" | "min" = "max",
	): RecordHolder | undefined => {
		const found = best(rows, value, want);
		return found
			? {
					tid: found.row.tid,
					season: found.row.season,
					value: found.value,
				}
			: undefined;
	};

	// The longest run of titles in a row, by club
	const titleRuns = tids.map((tid) => {
		const titleSeasons = topTier
			.filter((row) => row.tid === tid && row.champion)
			.map((row) => row.season)
			.sort((a, b) => a - b);
		let value = 0;
		let from = 0;
		let run = 0;
		let runFrom = 0;
		for (const [i, season] of titleSeasons.entries()) {
			if (titleSeasons[i - 1] === season - 1) {
				run += 1;
			} else {
				run = 1;
				runFrom = season;
			}
			if (run > value) {
				value = run;
				from = runFrom;
			}
		}
		return { tid, value, from, to: from + value - 1 };
	});

	const topFlightRuns = tids.map((tid) => ({
		tid,
		...getTopTierRun(seasons, tid),
	}));

	// The best of a set of runs, as a record holder. A run of one isn't a record.
	const longestRun = (
		runs: { tid: number; value: number; from: number; to: number }[],
		minimum = 2,
	): RecordHolder | undefined => {
		const found = best(runs, (run) =>
			run.value >= minimum ? run.value : undefined,
		);
		return found
			? {
					tid: found.row.tid,
					value: found.value,
					from: found.row.from,
					to: found.row.to,
				}
			: undefined;
	};

	return {
		allTimeTable,
		mostTitles: allTimeTable
			.filter((row) => row.titles > 0)
			.sort((a, b) => b.titles - a.titles || a.tid - b.tid)
			.slice(0, 5)
			.map((row) => ({ tid: row.tid, value: row.titles })),
		mostPoints: seasonRecord(topTier, (row) => row.points),
		fewestPoints: seasonRecord(topTier, (row) => row.points, "min"),
		longestTitleRun: longestRun(titleRuns),
		longestTopFlightRun: longestRun(topFlightRuns),
		longestWinningRun: seasonRecord(seasons, (row) => row.runs?.longestWinning),
		longestUnbeatenRun: seasonRecord(
			seasons,
			(row) => row.runs?.longestUnbeaten,
		),
		biggestWin: (() => {
			const found = best(seasons, (row) => row.runs?.biggestWin?.margin);
			const win = found?.row.runs?.biggestWin;
			return found && win
				? {
						tid: found.row.tid,
						season: found.row.season,
						value: win.margin,
						opponentTid: win.opponentTid,
						text: `${win.pts}-${win.oppPts}`,
					}
				: undefined;
		})(),
	};
};

/**
 * International Soccer Zen GM mod (storytelling): each Country's records and
 * all-time top-tier table with club names, the user's Country first.
 * Undefined outside a World.
 */
export const getWorldRecordsInfo = async () => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const teams = await idb.cache.teams.getAll();
	const teamSeasons = (
		await Promise.all(
			teams.map((t) =>
				idb.getCopies.teamSeasons({ tid: t.tid }, "noCopyCache"),
			),
		)
	).flat();
	const seasonsByCountryId = new Map<number, RecordSeason[]>();
	for (const teamSeason of teamSeasons) {
		const record = teamSeason.worldSeason;
		if (!record) {
			continue;
		}
		const countryId = countryIdByDivisionId.get(record.divisionId);
		if (countryId === undefined) {
			continue;
		}
		const rows = seasonsByCountryId.get(countryId) ?? [];
		rows.push({
			tid: teamSeason.tid,
			season: teamSeason.season,
			tier: record.tier,
			points: record.points,
			won: record.won,
			lost: record.lost,
			tied: record.tied,
			...(record.champion ? { champion: record.champion } : {}),
			...(record.runs ? { runs: record.runs } : {}),
		});
		seasonsByCountryId.set(countryId, rows);
	}

	const teamInfoCache = g.get("teamInfoCache");
	const club = (tid: number) => ({
		tid,
		abbrev: teamInfoCache[tid]?.abbrev ?? "???",
		region: teamInfoCache[tid]?.region ?? "",
		name: teamInfoCache[tid]?.name ?? "",
		imgURL: teamInfoCache[tid]?.imgURL,
		imgURLSmall: teamInfoCache[tid]?.imgURLSmall,
	});
	const withClub = (holder: RecordHolder | undefined) =>
		holder
			? {
					...holder,
					...club(holder.tid),
					opponent:
						holder.opponentTid === undefined
							? undefined
							: club(holder.opponentTid),
				}
			: undefined;

	const userTid = g.get("userTid");
	const userDivisionId = teams.find((t) => t.tid === userTid)?.divisionId;
	const userCountryId =
		userDivisionId === undefined
			? undefined
			: countryIdByDivisionId.get(userDivisionId);

	const countries = structure.countries.map((country) => {
		const records = getCountryRecords({
			seasons: seasonsByCountryId.get(country.countryId) ?? [],
		});
		return {
			countryId: country.countryId,
			name: country.name,
			topDivisionName:
				structure.competitionDivisions.find(
					(division) =>
						division.countryId === country.countryId && division.tier === 1,
				)?.name ?? "",
			allTimeTable: records.allTimeTable.map((row) => ({
				...row,
				...club(row.tid),
			})),
			mostTitles: records.mostTitles.map((row) => ({
				...row,
				...club(row.tid),
			})),
			records: [
				{
					label: "Most points in a season",
					holder: withClub(records.mostPoints),
				},
				{
					label: "Fewest points in a season",
					holder: withClub(records.fewestPoints),
				},
				{
					label: "Most titles in a row",
					holder: withClub(records.longestTitleRun),
				},
				{
					label: "Longest run in the top tier",
					holder: withClub(records.longestTopFlightRun),
				},
				{
					label: "Longest winning run",
					holder: withClub(records.longestWinningRun),
				},
				{
					label: "Longest unbeaten run",
					holder: withClub(records.longestUnbeatenRun),
				},
				{ label: "Biggest win", holder: withClub(records.biggestWin) },
			].flatMap((row) => (row.holder ? [{ ...row, holder: row.holder }] : [])),
		};
	});

	return [
		...countries.filter((country) => country.countryId === userCountryId),
		...countries.filter((country) => country.countryId !== userCountryId),
	];
};
