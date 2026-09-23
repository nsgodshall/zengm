import getWinner from "../../../common/getWinner.ts";
import type {
	Conditions,
	GameAttributesLeague,
	GameResults,
	ScheduleGame,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, logEvent } from "../../util/index.ts";
import { bySport } from "../../../common/sportFunctions.ts";
import { league } from "../index.ts";
import {
	drawChampionsLeagueGroups,
	getChampionsLeagueCountryCoefficients,
	getChampionsLeagueFirstKnockoutRound,
	getChampionsLeagueGroupSchedule,
	getChampionsLeagueGroupTable,
	getChampionsLeagueKnockoutWinner,
	getChampionsLeaguePrize,
	getChampionsLeagueQualifiers,
} from "./championsLeague.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import { ensureWorldFinanceLedger } from "./worldInfrastructure.ts";

export type ChampionsLeagueState = NonNullable<
	GameAttributesLeague["championsLeagueState"]
>;

export type ChampionsLeagueMatchup = Omit<
	ChampionsLeagueState["scheduledGames"][number],
	"gid"
>;

export const getChampionsLeagueState = () =>
	(g as unknown as Partial<GameAttributesLeague>).championsLeagueState;

export const validateChampionsLeagueState = (state: ChampionsLeagueState) => {
	const qualifierTids = state.qualifiers.map((qualifier) => qualifier.tid);
	const qualifiers = new Set(qualifierTids);
	if (
		qualifiers.size !== qualifierTids.length ||
		![8, 16].includes(qualifiers.size)
	) {
		throw new Error("Champions League state has an invalid qualifier field");
	}
	const groupedTids = state.groups.flat();
	if (
		state.groups.some((group) => group.length !== 4) ||
		groupedTids.length !== qualifiers.size ||
		new Set(groupedTids).size !== qualifiers.size ||
		groupedTids.some((tid) => !qualifiers.has(tid))
	) {
		throw new Error("Champions League state has invalid groups");
	}
	if (state.groupGames.length !== qualifiers.size * 3) {
		throw new Error("Champions League state has an invalid group schedule");
	}
	for (const game of state.groupGames) {
		const group = state.groups[game.groupId];
		if (
			!group ||
			game.matchday < 0 ||
			game.matchday > 5 ||
			game.homeTid === game.awayTid ||
			!group.includes(game.homeTid) ||
			!group.includes(game.awayTid)
		) {
			throw new Error("Champions League state has an invalid group game");
		}
	}
	const knockoutTids = new Set(state.knockoutSeeds.map((row) => row.tid));
	if (
		knockoutTids.size !== state.knockoutSeeds.length ||
		[...knockoutTids].some((tid) => !qualifiers.has(tid))
	) {
		throw new Error("Champions League state has invalid knockout seeds");
	}
	for (const game of state.knockoutGames) {
		if (
			game.homeTid === game.awayTid ||
			!knockoutTids.has(game.homeTid) ||
			!knockoutTids.has(game.awayTid) ||
			(game.winnerTid !== undefined &&
				game.winnerTid !== game.homeTid &&
				game.winnerTid !== game.awayTid)
		) {
			throw new Error("Champions League state has an invalid knockout game");
		}
	}
	const scheduledGids = state.scheduledGames.map((game) => game.gid);
	if (
		new Set(scheduledGids).size !== scheduledGids.length ||
		state.scheduledGames.some(
			(game) =>
				game.homeTid === game.awayTid ||
				!qualifiers.has(game.homeTid) ||
				!qualifiers.has(game.awayTid),
		)
	) {
		throw new Error("Champions League state has invalid scheduled games");
	}
	if (state.championTid !== undefined && !knockoutTids.has(state.championTid)) {
		throw new Error("Champions League state has an invalid champion");
	}
	for (const [tid, prize] of Object.entries(state.prizeMoneyByTid)) {
		if (!qualifiers.has(Number(tid)) || prize < 0 || !Number.isFinite(prize)) {
			throw new Error("Champions League state has invalid prize money");
		}
	}
};

export const saveChampionsLeagueState = async (state: ChampionsLeagueState) => {
	await league.setGameAttributes({ championsLeagueState: state });
};

const payChampionsLeaguePrize = async (
	state: ChampionsLeagueState,
	tid: number,
	stage: Parameters<typeof getChampionsLeaguePrize>[0],
) => {
	const prize = getChampionsLeaguePrize(stage);
	const teamSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsByTidSeason",
		[tid, state.season],
	);
	if (!teamSeason) {
		throw new Error(
			`Champions League prize recipient ${tid} has no ${state.season} team season`,
		);
	}
	teamSeason.worldFinance = ensureWorldFinanceLedger(teamSeason.worldFinance);
	teamSeason.cash += prize;
	teamSeason.worldFinance.prizeMoney += prize;
	state.prizeMoneyByTid[tid] = (state.prizeMoneyByTid[tid] ?? 0) + prize;
	await idb.cache.teamSeasons.put(teamSeason);
};

export const initializeChampionsLeague = async (conditions: Conditions) => {
	const season = g.get("season");
	const existing = getChampionsLeagueState();
	if (existing?.season === season) {
		validateChampionsLeagueState(existing);
		return existing;
	}

	const structure = getCompetitionStructure();
	if (structure.countries.length < 2 || structure.countries.length > 7) {
		return;
	}
	const tables = await getDivisionTables(season);
	const coefficients =
		(g as unknown as Partial<GameAttributesLeague>)
			.championsLeagueCoefficients ?? [];
	const coefficientByCountry = getChampionsLeagueCountryCoefficients({
		seasons: coefficients,
		currentSeason: season - 1,
	});
	const countries = structure.countries.map((country) => {
		const topDivision = structure.competitionDivisions
			.filter(
				(division) =>
					division.countryId === country.countryId && division.tier === 1,
			)
			.sort((a, b) => a.divisionId - b.divisionId)[0];
		if (!topDivision) {
			throw new Error(`Country ${country.countryId} has no top Division`);
		}
		return {
			countryId: country.countryId,
			coefficient: coefficientByCountry.get(country.countryId) ?? 0,
			table: (tables[topDivision.divisionId] ?? []).map((row) => ({
				tid: row.tid,
			})),
		};
	});
	const qualifiers = getChampionsLeagueQualifiers(countries);
	const drawnGroups = drawChampionsLeagueGroups(qualifiers);
	const state: ChampionsLeagueState = {
		season,
		qualifiers,
		groups: drawnGroups.map((group) => group.map((qualifier) => qualifier.tid)),
		groupGames: getChampionsLeagueGroupSchedule(drawnGroups),
		knockoutSeeds: [],
		knockoutGames: [],
		scheduledGames: [],
		pointsByCountry: {},
		prizeMoneyByTid: {},
	};
	for (const qualifier of qualifiers) {
		await payChampionsLeaguePrize(state, qualifier.tid, "entry");
	}
	const previousResults =
		(g as unknown as Partial<GameAttributesLeague>).championsLeagueResults ??
		[];
	await league.setGameAttributes({
		championsLeagueState: state,
		championsLeagueResults: previousResults.filter(
			(result) => result.season !== season,
		),
	});
	for (const qualifier of qualifiers) {
		const countryName = structure.countries.find(
			(country) => country.countryId === qualifier.countryId,
		)?.name;
		logEvent(
			{
				type: "playoffs",
				text: `The ${teamLink(qualifier.tid)} qualified for the Champions League after finishing ${qualifier.domesticPosition}${qualifier.domesticPosition === 1 ? "st" : qualifier.domesticPosition === 2 ? "nd" : qualifier.domesticPosition === 3 ? "rd" : "th"} in ${countryName ?? "their Country"}.`,
				showNotification: qualifier.tid === g.get("userTid"),
				hideInLiveGame: true,
				tids: [qualifier.tid],
				score: 10,
			},
			conditions,
		);
	}
	return state;
};

export const getChampionsLeagueEntrants = (
	state: ChampionsLeagueState | undefined,
) => new Set(state?.qualifiers.map((qualifier) => qualifier.tid) ?? []);

const addCountryPoints = (
	state: ChampionsLeagueState,
	tid: number,
	points: number,
) => {
	const countryId = state.qualifiers.find(
		(qualifier) => qualifier.tid === tid,
	)?.countryId;
	if (countryId !== undefined) {
		state.pointsByCountry[countryId] =
			(state.pointsByCountry[countryId] ?? 0) + points;
	}
};

const initializeKnockout = (state: ChampionsLeagueState) => {
	const entrants = state.groups.flatMap((tids, groupId) => {
		const group = tids.map((tid) =>
			state.qualifiers.find((qualifier) => qualifier.tid === tid)!,
		);
		const table = getChampionsLeagueGroupTable({
			group,
			games: state.groupGames.filter((game) => game.groupId === groupId),
		});
		return table.slice(0, 2).map((row, index) => ({
			tid: row.tid,
			seed: state.qualifiers.find((qualifier) => qualifier.tid === row.tid)!
				.seed,
			groupId,
			groupPosition: (index + 1) as 1 | 2,
		}));
	});
	const matchups = getChampionsLeagueFirstKnockoutRound(entrants);
	state.knockoutSeeds = [...entrants]
		.sort((a, b) => a.groupPosition - b.groupPosition || a.seed - b.seed)
		.map((entrant, index) => ({ tid: entrant.tid, seed: index + 1 }));
	state.knockoutGames = matchups.map((matchup) => ({ round: 0, ...matchup }));
};

const advanceKnockout = (state: ChampionsLeagueState) => {
	const currentRound = Math.max(
		...state.knockoutGames.map((game) => game.round),
	);
	const games = state.knockoutGames.filter(
		(game) => game.round === currentRound,
	);
	if (games.some((game) => game.winnerTid === undefined)) {
		return;
	}
	const winners = games.map((game) => game.winnerTid!);
	if (winners.length === 1) {
		state.championTid = winners[0];
		return;
	}
	const seedByTid = new Map(
		state.knockoutSeeds.map((entrant) => [entrant.tid, entrant.seed]),
	);
	winners.sort((a, b) => seedByTid.get(a)! - seedByTid.get(b)!);
	const nextRound = currentRound + 1;
	for (let i = 0; i < winners.length / 2; i++) {
		state.knockoutGames.push({
			round: nextRound,
			homeTid: winners[i]!,
			awayTid: winners[winners.length - 1 - i]!,
		});
	}
};

export const getActiveChampionsLeagueMatchups = (
	state: ChampionsLeagueState,
): ChampionsLeagueMatchup[] => {
	if (state.scheduledGames.length > 0 || state.championTid !== undefined) {
		return [];
	}
	const unplayedGroupGame = state.groupGames.find(
		(game) => game.homePts === undefined,
	);
	if (unplayedGroupGame) {
		return state.groupGames
			.filter(
				(game) =>
					game.matchday === unplayedGroupGame.matchday &&
					game.homePts === undefined,
			)
			.map((game) => ({
				stage: "group",
				groupId: game.groupId,
				matchday: game.matchday,
				homeTid: game.homeTid,
				awayTid: game.awayTid,
			}));
	}
	if (state.knockoutGames.length === 0) {
		initializeKnockout(state);
	} else {
		advanceKnockout(state);
	}
	if (state.championTid !== undefined) {
		return [];
	}
	const currentRound = Math.max(
		...state.knockoutGames.map((game) => game.round),
	);
	return state.knockoutGames
		.filter(
			(game) => game.round === currentRound && game.winnerTid === undefined,
		)
		.map((game) => ({
			stage: "knockout",
			round: game.round,
			homeTid: game.homeTid,
			awayTid: game.awayTid,
		}));
};

export const setChampionsLeagueScheduledGames = async (
	state: ChampionsLeagueState,
	matchups: ChampionsLeagueMatchup[],
	schedule: ScheduleGame[],
) => {
	const finalRound =
		matchups.length === 1 &&
		matchups[0]?.stage === "knockout" &&
		state.knockoutGames.filter((game) => game.round === matchups[0]!.round)
			.length === 1;
	state.scheduledGames = [];
	for (const matchup of matchups) {
		const game = schedule.find(
			(row) =>
				row.homeTid === matchup.homeTid && row.awayTid === matchup.awayTid,
		);
		if (!game) {
			throw new Error(
				`Champions League game ${matchup.homeTid}-${matchup.awayTid} was not scheduled`,
			);
		}
		if (finalRound) {
			game.neutralSite = true;
		}
		game.competition = "championsLeague";
		await idb.cache.schedule.put(game);
		state.scheduledGames.push({ gid: game.gid, ...matchup });
	}
};

const reportGame = (
	state: ChampionsLeagueState,
	game: ChampionsLeagueState["scheduledGames"][number],
	homePts: number,
	awayPts: number,
	winnerTid: number | undefined,
	conditions: Conditions,
) => {
	const isFinal =
		game.stage === "knockout" &&
		state.knockoutGames.filter((row) => row.round === game.round).length === 1;
	const winnerText =
		winnerTid === undefined
			? `drew ${homePts}-${awayPts}`
			: `won ${Math.max(homePts, awayPts)}-${Math.min(homePts, awayPts)}`;
	logEvent(
		{
			type: "playoffs",
			text: `${winnerTid === undefined ? `The ${teamLink(game.homeTid)} and ${teamLink(game.awayTid)}` : `The ${teamLink(winnerTid)}`} ${winnerText} in the Champions League${isFinal && winnerTid !== undefined ? " final and are World champions!" : "."}${game.stage === "knockout" && !isFinal && winnerTid !== undefined ? ` The ${teamLink(winnerTid === game.homeTid ? game.awayTid : game.homeTid)} were eliminated.` : ""}`,
			showNotification:
				game.homeTid === g.get("userTid") || game.awayTid === g.get("userTid"),
			hideInLiveGame: true,
			tids: [game.homeTid, game.awayTid],
			score: isFinal ? 20 : 10,
		},
		conditions,
	);
};

const markCupTiedPlayers = async (
	state: ChampionsLeagueState,
	result: GameResults,
) => {
	for (const team of result.team) {
		for (const gamePlayer of team.player) {
			const appeared = bySport({
				baseball: gamePlayer.stat.gp > 0,
				basketball: gamePlayer.stat.min > 0,
				football: gamePlayer.stat.min > 0,
				hockey: gamePlayer.stat.min > 0,
			});
			if (!appeared) {
				continue;
			}
			const player = await idb.cache.players.get(gamePlayer.id);
			if (player) {
				player.worldCupTie = {
					season: state.season,
					competition: "championsLeague",
					tid: team.id,
				};
				await idb.cache.players.put(player);
			}
		}
	}
};

export const recordChampionsLeagueResults = async (
	results: GameResults[],
	conditions: Conditions,
) => {
	const state = getChampionsLeagueState();
	if (!state || state.season !== g.get("season")) {
		return;
	}
	const historical = [
		...((g as unknown as Partial<GameAttributesLeague>)
			.championsLeagueResults ?? []),
	];
	for (const result of results) {
		const scheduled = state.scheduledGames.find(
			(game) => game.gid === result.gid,
		);
		if (!scheduled) {
			continue;
		}
		await markCupTiedPlayers(state, result);
		const home = result.team.find(
			(row: { id: number }) => row.id === scheduled.homeTid,
		);
		const away = result.team.find(
			(row: { id: number }) => row.id === scheduled.awayTid,
		);
		if (!home || !away) {
			throw new Error(`Champions League game ${result.gid} has invalid clubs`);
		}
		const homePts = home.stat.pts as number;
		const awayPts = away.stat.pts as number;
		const winner = getWinner([home.stat, away.stat]);
		let winnerTid =
			winner === 0
				? scheduled.homeTid
				: winner === 1
					? scheduled.awayTid
					: undefined;
		if (scheduled.stage === "group") {
			const game = state.groupGames.find(
				(row) =>
					row.groupId === scheduled.groupId &&
					row.matchday === scheduled.matchday &&
					row.homeTid === scheduled.homeTid &&
					row.awayTid === scheduled.awayTid,
			)!;
			game.gid = result.gid;
			game.homePts = homePts;
			game.awayPts = awayPts;
			if (winnerTid === undefined) {
				addCountryPoints(state, scheduled.homeTid, 1);
				addCountryPoints(state, scheduled.awayTid, 1);
				await payChampionsLeaguePrize(state, scheduled.homeTid, "draw");
				await payChampionsLeaguePrize(state, scheduled.awayTid, "draw");
			} else {
				addCountryPoints(state, winnerTid, 2);
				await payChampionsLeaguePrize(state, winnerTid, "win");
			}
			const groupGames = state.groupGames.filter(
				(row) => row.groupId === scheduled.groupId,
			);
			if (
				groupGames.every(
					(row) => row.homePts !== undefined && row.awayPts !== undefined,
				)
			) {
				const groupTids = state.groups[scheduled.groupId!];
				if (!groupTids) {
					throw new Error("Champions League group result has no group");
				}
				const group = groupTids.map((tid) =>
					state.qualifiers.find((qualifier) => qualifier.tid === tid)!,
				);
				for (const eliminated of getChampionsLeagueGroupTable({
					group,
					games: groupGames,
				}).slice(2)) {
					logEvent(
						{
							type: "playoffs",
							text: `The ${teamLink(eliminated.tid)} were eliminated from the Champions League group stage.`,
							showNotification: eliminated.tid === g.get("userTid"),
							hideInLiveGame: true,
							tids: [eliminated.tid],
							score: 10,
						},
						conditions,
					);
				}
			}
		} else {
			const seedByTid = new Map(
				state.knockoutSeeds.map((entrant) => [entrant.tid, entrant.seed]),
			);
			winnerTid ??= getChampionsLeagueKnockoutWinner({
				homeTid: scheduled.homeTid,
				awayTid: scheduled.awayTid,
				homePts,
				awayPts,
				seedByTid,
			});
			const game = state.knockoutGames.find(
				(row) =>
					row.round === scheduled.round &&
					row.homeTid === scheduled.homeTid &&
					row.awayTid === scheduled.awayTid,
			)!;
			Object.assign(game, { gid: result.gid, homePts, awayPts, winnerTid });
			addCountryPoints(state, winnerTid, 3);
			await payChampionsLeaguePrize(state, winnerTid, "advance");
		}
		state.scheduledGames = state.scheduledGames.filter(
			(game) => game.gid !== result.gid,
		);
		historical.push({
			season: state.season,
			stage: scheduled.stage,
			groupId: scheduled.groupId,
			matchday: scheduled.matchday,
			round: scheduled.round,
			gid: result.gid,
			homeTid: scheduled.homeTid,
			awayTid: scheduled.awayTid,
			homePts,
			awayPts,
			winnerTid,
		});
		reportGame(state, scheduled, homePts, awayPts, winnerTid, conditions);
	}
	await league.setGameAttributes({
		championsLeagueState: state,
		championsLeagueResults: historical,
	});
};

export const finalizeChampionsLeague = async (state: ChampionsLeagueState) => {
	if (state.championTid === undefined) {
		throw new Error("Cannot finalize a Champions League without a champion");
	}
	if (!state.championPrizePaid) {
		await payChampionsLeaguePrize(state, state.championTid, "champion");
		state.championPrizePaid = true;
	}
	const coefficients = [
		...(
			(g as unknown as Partial<GameAttributesLeague>)
				.championsLeagueCoefficients ?? []
		).filter((row) => row.season !== state.season),
		{ season: state.season, pointsByCountry: state.pointsByCountry },
	].filter((row) => row.season >= state.season - 4);
	const history = [
		...(
			(g as unknown as Partial<GameAttributesLeague>).championsLeagueHistory ??
			[]
		).filter((row) => row.season !== state.season),
		{
			season: state.season,
			qualifiers: state.qualifiers,
			groups: state.groups,
			prizeMoneyByTid: state.prizeMoneyByTid,
			championTid: state.championTid,
		},
	].sort((a, b) => a.season - b.season);
	await league.setGameAttributes({
		championsLeagueCoefficients: coefficients,
		championsLeagueHistory: history,
		championsLeagueState: state,
	});
};
