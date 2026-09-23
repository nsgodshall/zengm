import type { GameAttributesLeague } from "../../../common/types.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	getChampionsLeagueCountryCoefficients,
	getChampionsLeagueGroupTable,
} from "./championsLeague.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";

/** Display model for the Champions League section of a World's tournaments page. */
const getChampionsLeagueView = async (season: number) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}
	const gameAttributes = g as unknown as Partial<GameAttributesLeague>;
	const current = gameAttributes.championsLeagueState;
	const history = gameAttributes.championsLeagueHistory ?? [];
	const snapshot =
		current?.season === season
			? current
			: history.find((row) => row.season === season);
	const results = (gameAttributes.championsLeagueResults ?? []).filter(
		(result) => result.season === season,
	);

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: ["abbrev", "region", "name", "imgURL", "imgURLSmall"],
			season,
			showNoStats: true,
		},
		"noCopyCache",
	);
	const teamByTid = new Map(teams.map((team) => [team.tid, team.seasonAttrs]));
	const countryNameById = new Map(
		structure.countries.map((country) => [country.countryId, country.name]),
	);
	const qualifierByTid = new Map(
		snapshot?.qualifiers.map((qualifier) => [qualifier.tid, qualifier]) ?? [],
	);
	const club = (tid: number) => {
		const team = teamByTid.get(tid);
		const qualifier = qualifierByTid.get(tid);
		return {
			tid,
			abbrev: team?.abbrev ?? "",
			region: team?.region ?? "",
			name: team?.name ?? "",
			imgURL: team?.imgURL ?? "",
			imgURLSmall: team?.imgURLSmall,
			seed: qualifier?.seed,
			countryName:
				qualifier === undefined
					? ""
					: (countryNameById.get(qualifier.countryId) ?? ""),
			domesticPosition: qualifier?.domesticPosition,
			prizeMoney: snapshot?.prizeMoneyByTid[tid] ?? 0,
		};
	};

	const groupGames =
		snapshot && "groupGames" in snapshot
			? snapshot.groupGames.map((game) => ({
					...game,
					winnerTid:
						game.homePts === undefined ||
						game.awayPts === undefined ||
						game.homePts === game.awayPts
							? undefined
							: game.homePts > game.awayPts
								? game.homeTid
								: game.awayTid,
				}))
			: results
					.filter(
						(result) =>
							result.stage === "group" &&
							result.groupId !== undefined &&
							result.matchday !== undefined,
					)
					.map((result) => ({
						groupId: result.groupId!,
						matchday: result.matchday!,
						homeTid: result.homeTid,
						awayTid: result.awayTid,
						gid: result.gid,
						homePts: result.homePts,
						awayPts: result.awayPts,
						winnerTid: result.winnerTid,
					}));
	const groups =
		snapshot?.groups.map((tids, groupId) => {
			const qualifiers = tids.map((tid) => qualifierByTid.get(tid)!);
			const games = groupGames.filter((game) => game.groupId === groupId);
			const table = getChampionsLeagueGroupTable({ group: qualifiers, games });
			return {
				groupId,
				rows: table.map((row) => {
					let won = 0;
					let drawn = 0;
					for (const game of games) {
						if (game.homeTid !== row.tid && game.awayTid !== row.tid) {
							continue;
						}
						if (game.homePts === game.awayPts) {
							drawn += 1;
						} else if (game.winnerTid === row.tid) {
							won += 1;
						}
					}
					return {
						...row,
						club: club(row.tid),
						won,
						drawn,
						lost: row.played - won - drawn,
					};
				}),
				matchdays: range(6).map((matchday) => ({
					matchday,
					games: games
						.filter((game) => game.matchday === matchday)
						.map((game) => ({
							...game,
							home: club(game.homeTid),
							away: club(game.awayTid),
						})),
				})),
			};
		}) ?? [];

	const knockoutResults =
		snapshot && "knockoutGames" in snapshot
			? snapshot.knockoutGames
			: results.filter((result) => result.stage === "knockout");
	const numRounds = Math.max(
		0,
		...knockoutResults.map((result) => (result.round ?? 0) + 1),
	);
	const knockoutRounds = range(numRounds).map((round) => ({
		round,
		games: knockoutResults
			.filter((result) => result.round === round)
			.map((result) => ({
				...result,
				home: club(result.homeTid),
				away: club(result.awayTid),
			})),
	}));

	const coefficientByCountry = getChampionsLeagueCountryCoefficients({
		seasons: gameAttributes.championsLeagueCoefficients ?? [],
		currentSeason: season,
	});
	const coefficients = structure.countries
		.map((country) => ({
			countryId: country.countryId,
			countryName: country.name,
			points: coefficientByCountry.get(country.countryId) ?? 0,
		}))
		.sort((a, b) => b.points - a.points || a.countryId - b.countryId);
	const pastWinners = [...history]
		.sort((a, b) => b.season - a.season)
		.map((row) => ({
			season: row.season,
			club: club(row.championTid),
		}));

	return {
		season,
		available: snapshot !== undefined,
		champion:
			snapshot?.championTid === undefined
				? undefined
				: club(snapshot.championTid),
		qualifiers:
			snapshot?.qualifiers
				.map((qualifier) => club(qualifier.tid))
				.sort((a, b) => a.seed! - b.seed!) ?? [],
		groups,
		knockoutRounds,
		coefficients,
		pastWinners,
	};
};

export default getChampionsLeagueView;
