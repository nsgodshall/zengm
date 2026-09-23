import getWinner from "../../../common/getWinner.ts";
import type {
	Conditions,
	GameAttributesLeague,
	GameResults,
	ScheduleGame,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, logEvent } from "../../util/index.ts";
import { league } from "../index.ts";
import setSchedule from "../season/setSchedule.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	getActiveMatchups,
	getGameWinner,
	getLinkProgress,
	getLinkWinners,
	recordGame,
	type PromotionPlayoffLink,
} from "./promotionPlayoffState.ts";
import resolvePromotionRelegation from "./resolvePromotionRelegation.ts";
import teamLink from "./teamLink.ts";
import {
	finalizeChampionsLeague,
	getActiveChampionsLeagueMatchups,
	getChampionsLeagueState,
	saveChampionsLeagueState,
	setChampionsLeagueScheduledGames,
} from "./championsLeagueSchedule.ts";

export type PromotionPlayoffState = NonNullable<
	GameAttributesLeague["promotionPlayoffState"]
>;

export const getPromotionPlayoffState = () =>
	(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffState;

const saveState = async (state: PromotionPlayoffState) => {
	await league.setGameAttributes({ promotionPlayoffState: state });
};

/** Build the current season's brackets from the final Division tables. */
export const initializePromotionPlayoffs = async () => {
	const season = g.get("season");
	const existing = getPromotionPlayoffState();
	if (existing?.season === season) {
		return existing;
	}

	const structure = getCompetitionStructure();
	const tables = await getDivisionTables(season);
	const results = resolvePromotionRelegation(
		structure.promotionRelegationLinks,
		tables,
	);
	const state: PromotionPlayoffState = {
		season,
		links: results
			.filter((result) => result.numPromotionPlayoffSpots > 0)
			.map((result) => ({
				linkId: result.linkId,
				entrants: result.promotionPlayoffParticipants,
				numSpots: result.numPromotionPlayoffSpots,
				games: [],
			})),
		scheduledGames: [],
	};

	const previousResults =
		(g as unknown as Partial<GameAttributesLeague>).promotionPlayoffResults ??
		[];
	await league.setGameAttributes({
		promotionPlayoffState: state,
		promotionPlayoffResults: previousResults.filter(
			(game) => game.season !== season,
		),
	});
	return state;
};

export const getPromotionPlayoffEntrants = (state: PromotionPlayoffState) =>
	new Set(state.links.flatMap((link) => link.entrants));

type ScheduledWorldTournamentGame = {
	gid: number;
	homeTid: number;
	awayTid: number;
	competition: NonNullable<ScheduleGame["competition"]>;
};

const matchesScheduledGame = (
	game: ScheduleGame,
	expected: ScheduledWorldTournamentGame,
) =>
	game.gid === expected.gid &&
	game.homeTid === expected.homeTid &&
	game.awayTid === expected.awayTid &&
	game.competition === expected.competition;

/**
 * If the browser's schedule cache loses a matchday that the playoff phase
 * already persisted, restore it from the saved league before deciding the
 * bracket is corrupt.
 */
const ensureScheduledGamesInCache = async (
	expected: ScheduledWorldTournamentGame[],
) => {
	const cached = await idb.cache.schedule.getAll();
	if (
		expected.every((scheduled) =>
			cached.some((game) => matchesScheduledGame(game, scheduled)),
		)
	) {
		return true;
	}

	const persisted = await idb.league.getAll("schedule");
	const recovered: ScheduleGame[] = [];
	for (const scheduled of expected) {
		const game = persisted.find((row) => matchesScheduledGame(row, scheduled));
		if (!game) {
			return false;
		}
		recovered.push(game);
	}

	await idb.cache.schedule.clear();
	await idb.cache.schedule.putAll(recovered);
	return true;
};

/**
 * Put every link's current round on the ordinary schedule. Returns true only
 * when all links have produced their promotion winners.
 */
export const newSchedulePromotionPlayoffsDay = async () => {
	const state = getPromotionPlayoffState();
	if (!state || state.season !== g.get("season")) {
		throw new Error(
			"Promotion playoff state is missing for the current season",
		);
	}

	const championsLeagueState = getChampionsLeagueState();
	const scheduledGames: ScheduledWorldTournamentGame[] = [
		...state.scheduledGames.map((game) => ({
			...game,
			competition: "promotionPlayoff" as const,
		})),
		...(championsLeagueState?.scheduledGames.map((game) => ({
			...game,
			competition: "championsLeague" as const,
		})) ?? []),
	];
	if (scheduledGames.length > 0) {
		if (await ensureScheduledGamesInCache(scheduledGames)) {
			return false;
		}
		throw new Error(
			"Promotion playoff state contains scheduled games that are neither on the schedule nor recorded as results",
		);
	}

	const matchups = state.links.flatMap((link) => getActiveMatchups(link));
	const championsLeagueMatchups = championsLeagueState
		? getActiveChampionsLeagueMatchups(championsLeagueState)
		: [];
	if (matchups.length === 0 && championsLeagueMatchups.length === 0) {
		const promotionDone = state.links.every(
			(link) => getLinkProgress(link).done,
		);
		const championsLeagueDone =
			!championsLeagueState || championsLeagueState.championTid !== undefined;
		if (championsLeagueState?.championTid !== undefined) {
			await finalizeChampionsLeague(championsLeagueState);
		}
		return promotionDone && championsLeagueDone;
	}
	const allMatchups = [...matchups, ...championsLeagueMatchups];
	const scheduledTids = allMatchups.flatMap((matchup) => [
		matchup.homeTid,
		matchup.awayTid,
	]);
	if (new Set(scheduledTids).size !== scheduledTids.length) {
		throw new Error("A club cannot play twice on one World tournament day");
	}

	await setSchedule(
		allMatchups.map((matchup) => [matchup.homeTid, matchup.awayTid]),
	);
	const schedule = await idb.cache.schedule.getAll();
	state.scheduledGames = matchups.map((matchup) => {
		const game = schedule.find(
			(game) =>
				game.homeTid === matchup.homeTid && game.awayTid === matchup.awayTid,
		);
		if (!game) {
			throw new Error(
				`Promotion playoff game ${matchup.homeTid}-${matchup.awayTid} was not added to the schedule`,
			);
		}
		return { gid: game.gid, ...matchup };
	});
	for (const scheduled of state.scheduledGames) {
		const game = schedule.find((row) => row.gid === scheduled.gid)!;
		game.competition = "promotionPlayoff";
		await idb.cache.schedule.put(game);
	}
	await saveState(state);
	if (championsLeagueState) {
		await setChampionsLeagueScheduledGames(
			championsLeagueState,
			championsLeagueMatchups,
			schedule,
		);
		await saveChampionsLeagueState(championsLeagueState);
	}
	return false;
};

const reportGame = (
	link: PromotionPlayoffLink,
	game: PromotionPlayoffLink["games"][number],
	conditions: Conditions,
) => {
	const progress = getLinkProgress(link);
	const homeWon = game.winnerTid === game.homeTid;
	const loserTid = homeWon ? game.awayTid : game.homeTid;
	const winnerPts = homeWon ? game.homePts : game.awayPts;
	const loserPts = homeWon ? game.awayPts : game.homePts;
	const roundName = progress.done
		? "the final round"
		: `round ${game.round + 1}`;
	logEvent(
		{
			type: "playoffs",
			text: `The ${teamLink(game.winnerTid)} beat the ${teamLink(
				loserTid,
			)} ${winnerPts}-${loserPts}${
				winnerPts === loserPts ? ", going through as the higher seed," : ""
			} in ${roundName} of their promotion playoff.`,
			showNotification:
				game.homeTid === g.get("userTid") || game.awayTid === g.get("userTid"),
			hideInLiveGame: true,
			tids: [game.winnerTid, loserTid],
			score: 10,
		},
		conditions,
	);
};

/** Record real scheduled game results in the persisted brackets. */
export const recordPromotionPlayoffResults = async (
	results: GameResults[],
	conditions: Conditions,
) => {
	const state = getPromotionPlayoffState();
	if (!state || state.season !== g.get("season")) {
		throw new Error(
			"Promotion playoff state is missing for the current season",
		);
	}

	const historical = [
		...((g as unknown as Partial<GameAttributesLeague>)
			.promotionPlayoffResults ?? []),
	];
	for (const result of results) {
		const scheduled = state.scheduledGames.find(
			(game) => game.gid === result.gid,
		);
		if (!scheduled) {
			continue;
		}
		const linkIndex = state.links.findIndex(
			(link) => link.linkId === scheduled.linkId,
		);
		const link = state.links[linkIndex];
		if (!link) {
			throw new Error(`Promotion playoff link ${scheduled.linkId} not found`);
		}

		const home = result.team.find(
			(team: { id: number }) => team.id === scheduled.homeTid,
		);
		const away = result.team.find(
			(team: { id: number }) => team.id === scheduled.awayTid,
		);
		if (!home || !away) {
			throw new Error(
				`Promotion playoff game ${result.gid} does not contain its scheduled clubs`,
			);
		}
		const homePts = home.stat.pts as number;
		const awayPts = away.stat.pts as number;
		const winner = getWinner([home.stat, away.stat]);
		const winnerTid =
			winner === 0
				? scheduled.homeTid
				: winner === 1
					? scheduled.awayTid
					: getGameWinner({
							entrants: link.entrants,
							homeTid: scheduled.homeTid,
							awayTid: scheduled.awayTid,
							homePts,
							awayPts,
						});
		const game = {
			gid: result.gid,
			round: scheduled.round,
			homeTid: scheduled.homeTid,
			awayTid: scheduled.awayTid,
			homePts,
			awayPts,
			winnerTid,
		};
		const updated = recordGame(link, game);
		state.links[linkIndex] = updated;
		state.scheduledGames = state.scheduledGames.filter(
			(other) => other.gid !== result.gid,
		);
		historical.push({ season: state.season, linkId: link.linkId, ...game });
		reportGame(updated, game, conditions);
	}

	await league.setGameAttributes({
		promotionPlayoffState: state,
		promotionPlayoffResults: historical,
	});
};

export const getPromotionPlayoffWinners = (state: PromotionPlayoffState) =>
	Object.fromEntries(
		state.links.map((link) => [link.linkId, getLinkWinners(link)]),
	);
