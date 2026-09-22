import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import type {
	Conditions,
	GameAttributesLeague,
} from "../../../common/types.ts";
import { league } from "../index.ts";
import {
	type CompetitionStructure,
	getLegacyConfsDivs,
	isSingleDivision,
} from "./competitionStructure.ts";
import { getDivisionTables } from "./divisionTables.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import planEndOfSeason, {
	buildEndOfSeasonPlan,
	type EndOfSeasonPlan,
} from "./planEndOfSeason.ts";
import playPromotionPlayoffGame from "./playPromotionPlayoffGame.ts";
import { getPromotionPlayoffWinners } from "./promotionPlayoffSchedule.ts";
import teamLink from "./teamLink.ts";
import {
	getChampionPrize,
	getPromotionPrize,
	regressHype,
} from "./worldRevenue.ts";
import { releaseRelegationClausePlayers } from "./relegationClauses.ts";
import { ensureWorldFinanceLedger } from "./worldInfrastructure.ts";

/**
 * A top-tier champion is its Country's champion, marked the same way as a
 * champion in a normal ZenGM league with no playoffs (playoffRoundsWon 0), so it
 * gets the championship award and shows in league history. Lower-tier champions
 * just get the news.
 */
const crownChampions = async (
	structure: CompetitionStructure,
	champions: EndOfSeasonPlan["champions"],
	conditions: Conditions,
) => {
	for (const { division, row } of champions) {
		const isTopTier = division.tier === 1;

		// Epic 8: every Division champion wins prize money (see
		// competition/worldRevenue.ts)
		const prize = getChampionPrize({
			tier: division.tier,
			salaryCap: g.get("salaryCap"),
		});
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[row.tid, g.get("season")],
		);
		if (teamSeason) {
			teamSeason.worldFinance = ensureWorldFinanceLedger(
				teamSeason.worldFinance,
			);
			if (isTopTier) {
				teamSeason.playoffRoundsWon = 0;
				teamSeason.hype = helpers.bound(teamSeason.hype + 0.2, 0, 1);
			}
			teamSeason.cash += prize;
			teamSeason.worldFinance.prizeMoney += prize;
			await idb.cache.teamSeasons.put(teamSeason);
		}

		const country = structure.countries.find(
			(country) => country.countryId === division.countryId,
		);

		logEvent(
			{
				type: "playoffs",
				text: `The ${teamLink(row.tid)} finished top of ${division.name} with ${
					row.points
				} points${isTopTier ? ` and are ${country?.name} champions!` : "."} They win ${helpers.formatCurrency(
					prize / 1000,
					"M",
				)} in prize money.`,
				showNotification: row.tid === g.get("userTid"),
				hideInLiveGame: true,
				tids: [row.tid],
				score: isTopTier ? 20 : 10,
			},
			conditions,
		);
	}
};

// How much hype a club gains when it's promoted, or loses when it's relegated
export const PROMOTION_HYPE = 0.05;

/**
 * Epic 8: every summer, each club's hype moves part of the way back to average
 * (see regressHype), before titles, promotion, and relegation change it.
 * Otherwise clubs that win take their hype up a tier with them, and lower
 * tiers' hype sags season after season.
 */
const steadyHype = async (season: number) => {
	for (const teamSeason of await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[season], [season, "Z"]],
	)) {
		teamSeason.hype = helpers.bound(regressHype(teamSeason.hype), 0, 1);
		await idb.cache.teamSeasons.put(teamSeason);
	}
};

/**
 * Only the team changes: this season's team season keeps the Division the club
 * actually played in, and newPhasePreseason copies next season's from the team.
 * cid/did follow the Division, since confs/divs mirror the structure.
 */
const applyMoves = async (
	structure: CompetitionStructure,
	{ moves, playoffWinnerTids }: EndOfSeasonPlan,
	conditions: Conditions,
) => {
	const { confDivByDivisionId } = getLegacyConfsDivs(structure);
	const divisionsById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);

	for (const move of moves) {
		const t = await idb.cache.teams.get(move.tid);
		if (!t) {
			throw new Error(`Team ${move.tid} not found`);
		}

		const { cid, did } = confDivByDivisionId.get(move.toDivisionId)!;
		t.divisionId = move.toDivisionId;
		t.cid = cid;
		t.did = did;
		await idb.cache.teams.put(t);

		const from = divisionsById.get(move.fromDivisionId)!;
		const to = divisionsById.get(move.toDivisionId)!;
		const promoted = to.tier < from.tier;

		// Promotion excites fans and relegation deflates them, in place of ZenGM's
		// hype for making or missing the playoffs. Next season's team season
		// starts from this one's hype.
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[move.tid, g.get("season")],
		);
		// Epic 8: promotion also pays prize money (see competition/worldRevenue.ts)
		const prize = promoted
			? getPromotionPrize({ tier: from.tier, salaryCap: g.get("salaryCap") })
			: 0;
		if (teamSeason) {
			teamSeason.worldFinance = ensureWorldFinanceLedger(
				teamSeason.worldFinance,
			);
			teamSeason.hype = helpers.bound(
				teamSeason.hype + (promoted ? PROMOTION_HYPE : -PROMOTION_HYPE),
				0,
				1,
			);
			teamSeason.cash += prize;
			teamSeason.worldFinance.prizeMoney += prize;
			await idb.cache.teamSeasons.put(teamSeason);
		}

		let text;
		if (!promoted) {
			text = `The ${teamLink(move.tid)} were relegated from ${from.name} to ${to.name}.`;
		} else if (playoffWinnerTids.has(move.tid)) {
			text = `The ${teamLink(move.tid)} won the ${from.name} promotion playoff and were promoted to ${to.name}!`;
		} else {
			text = `The ${teamLink(move.tid)} were promoted from ${from.name} to ${to.name}!`;
		}
		if (prize > 0) {
			text += ` They get ${helpers.formatCurrency(prize / 1000, "M")} in prize money.`;
		}

		// Epic 8: a relegated club's best-paid players walk away as free agents
		// (see competition/relegationClauses.ts)
		if (!promoted) {
			const clausePlayers = await releaseRelegationClausePlayers(move.tid);
			if (clausePlayers.length > 0) {
				const names = clausePlayers.map(
					(p) =>
						`<a href="${helpers.leagueUrl(["player", p.pid])}">${p.firstName} ${p.lastName}</a>`,
				);
				text += ` Relegation clauses let ${names.join(", ")} leave as free agents.`;
			}
		}

		logEvent(
			{
				type: promoted ? "promotion" : "relegation",
				text,
				showNotification: move.tid === g.get("userTid"),
				hideInLiveGame: true,
				tids: [move.tid],
				score: 20,
			},
			conditions,
		);
	}
};

type PromotionPlayoffGames = NonNullable<
	GameAttributesLeague["promotionPlayoffResults"]
>;

// A news item for each promotion playoff game
const reportPromotionPlayoffGames = (
	structure: CompetitionStructure,
	games: PromotionPlayoffGames,
	conditions: Conditions,
) => {
	for (const game of games) {
		const link = structure.promotionRelegationLinks.find(
			(link) => link.id === game.linkId,
		);
		const division = structure.competitionDivisions.find(
			(division) => division.divisionId === link?.lowerDivisionId,
		);

		const homeWon = game.winnerTid === game.homeTid;
		const loserTid = homeWon ? game.awayTid : game.homeTid;
		const winnerPts = homeWon ? game.homePts : game.awayPts;
		const loserPts = homeWon ? game.awayPts : game.homePts;

		const lastRound = Math.max(
			...games
				.filter((other) => other.linkId === game.linkId)
				.map((other) => other.round),
		);
		const numLastRoundGames = games.filter(
			(other) => other.linkId === game.linkId && other.round === lastRound,
		).length;
		const roundName =
			game.round < lastRound
				? `round ${game.round + 1}`
				: numLastRoundGames === 1
					? "the final"
					: "the last round";

		logEvent(
			{
				type: "playoffs",
				text: `The ${teamLink(game.winnerTid)} beat the ${teamLink(
					loserTid,
				)} ${winnerPts}-${loserPts}${
					winnerPts === loserPts ? ", going through as the higher seed," : ""
				} in ${roundName} of the ${division?.name} promotion playoff.`,
				showNotification: false,
				hideInLiveGame: true,
				tids: [game.winnerTid, loserTid],
				score: 10,
			},
			conditions,
		);
	}
};

/**
 * International Soccer Zen GM mod (Epic 3): end the season in a World with
 * more than one Division. Crowns each Division's champion from its table,
 * plays any promotion playoffs, and moves clubs up and down for next season
 * (see planEndOfSeason).
 *
 * Returns false and does nothing in a single-Division league, which ends its
 * season the normal ZenGM way.
 */
const doEndOfSeason = async (conditions: Conditions) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return false;
	}

	const season = g.get("season");
	const tables = await getDivisionTables(season);
	const playoffState = (g as unknown as Partial<GameAttributesLeague>)
		.promotionPlayoffState;
	let plan: EndOfSeasonPlan;
	if (playoffState?.season === season) {
		plan = buildEndOfSeasonPlan(
			structure,
			tables,
			getPromotionPlayoffWinners(playoffState),
		);
	} else {
		// Compatibility for a World saved after its regular season under the old
		// batch-simulated promotion playoff flow.
		const games: PromotionPlayoffGames = [];
		plan = await planEndOfSeason(
			structure,
			tables,
			async (homeTid, awayTid, { linkId, round }) => {
				const { gid, winnerTid, homePts, awayPts } =
					await playPromotionPlayoffGame(homeTid, awayTid, conditions);
				games.push({
					gid,
					season,
					linkId,
					round,
					homeTid,
					awayTid,
					homePts,
					awayPts,
					winnerTid,
				});
				return winnerTid;
			},
		);

		if (games.length > 0) {
			reportPromotionPlayoffGames(structure, games, conditions);

			const previous =
				(g as unknown as Partial<GameAttributesLeague>)
					.promotionPlayoffResults ?? [];
			await league.setGameAttributes({
				promotionPlayoffResults: [
					...previous.filter((game) => game.season !== season),
					...games,
				],
			});
		}
	}

	await steadyHype(season);
	await crownChampions(structure, plan.champions, conditions);
	await applyMoves(structure, plan, conditions);

	return true;
};

export default doEndOfSeason;
