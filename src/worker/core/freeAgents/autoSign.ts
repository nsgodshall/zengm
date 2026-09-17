import { PLAYER } from "../../../common/constants.ts";
import { player, team } from "../index.ts";
import getBest from "./getBest.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import { orderBy } from "../../../common/utils.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import { shuffle } from "../../../common/random.ts";
import { isSingleDivision } from "../competition/competitionStructure.ts";
import { getCompetitionStructure } from "../competition/ensureCompetitionStructure.ts";
import { getWageBudgets } from "../competition/wageBudgets.ts";
import {
	getStatureWageFactor,
	orderByStatureWeightedRandom,
	STATURE_EFFECT_SETTINGS,
} from "../competition/statureEffects.ts";
import {
	buildClubSquadPlan,
	evaluatePlayerForClubSquadPlan,
	getClubRecruitmentFocus,
	getWageBudgetAfterMinimumRosterReserve,
} from "../competition/clubSquadPlan.ts";
import { buildWorldClubStrategyForRoster } from "../competition/buildClubSummerPlanForRoster.ts";
import {
	canAddContractToWorldClubStrategy,
	getWorldPlayingTimePromise,
} from "../competition/clubStrategy.ts";
import {
	getWorldCountryIdByPlayerCountry,
	getWorldWageMarketRecruitmentScore,
} from "../competition/localWageMarket.ts";

/**
 * AI teams sign free agents.
 *
 * Each team (in random order) will sign free agents up to their salary cap or roster size limit. This should eventually be made smarter
 *
 * @memberOf core.freeAgents
 * @return {Promise}
 */
const autoSign = async () => {
	const players = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	if (players.length === 0) {
		return;
	}

	// List of free agents, sorted by value
	let playersSorted = orderBy(players, "value", "desc");

	// International Soccer Zen GM mod (Epic 4): in a World, clubs sign free
	// agents within their wage budgets rather than a salary cap
	const wageBudgets = isSingleDivision(getCompetitionStructure())
		? undefined
		: await getWageBudgets();

	// Randomly order teams
	const teams = await idb.cache.teams.getAll();
	const structure = getCompetitionStructure();
	const tierByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const countryIdByPlayerCountry = getWorldCountryIdByPlayerCountry(
		structure.countries,
	);
	// International Soccer Zen GM mod (storytelling, Phase 6b): in a World,
	// players would rather join bigger clubs, so bigger clubs tend to get first
	// pick (see competition/statureEffects.ts)
	shuffle(teams);
	const orderedTeams =
		wageBudgets === undefined
			? teams
			: orderByStatureWeightedRandom(
					teams,
					(t) => t.worldStature ?? STATURE_EFFECT_SETTINGS.neutralStature,
				);

	for (const t of orderedTeams) {
		// Skip the user's team
		if (
			g.get("userTids").includes(t.tid) &&
			!local.autoPlayUntil &&
			!g.get("spectator")
		) {
			continue;
		}

		if (t.disabled) {
			continue;
		}

		let probSkip;
		if (isSport("basketball")) {
			probSkip = t.strategy === "rebuilding" ? 0.9 : 0.75;
		} else {
			probSkip = 0.5;
		}

		// Skip teams sometimes
		if (Math.random() < probSkip) {
			continue;
		}

		const playersOnRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			t.tid,
		);

		// With forceHistoricalRosters, only sign FAs if we have to
		if (
			playersOnRoster.length >= g.get("minRosterSize") &&
			g.get("forceHistoricalRosters")
		) {
			continue;
		}

		// Ignore roster size, will drop bad player if necessary in checkRosterSizes, and getBest won't sign min contract player unless under the roster limit
		const payroll = await team.getPayroll(t.tid);
		const wageBudget = wageBudgets?.get(t.tid);
		const isLowerTier =
			t.divisionId !== undefined &&
			(tierByDivisionId.get(t.divisionId) ?? 1) > 1;
		let playersForTeam = playersSorted;
		let strategyPlan:
			| ReturnType<typeof buildWorldClubStrategyForRoster>
			| undefined;
		if (wageBudget !== undefined) {
			const teamSeason = await idb.cache.teamSeasons.indexGet(
				"teamSeasonsBySeasonTid",
				[g.get("season"), t.tid],
			);
			if (teamSeason) {
				const tier =
					t.divisionId === undefined
						? 1
						: (tierByDivisionId.get(t.divisionId) ?? 1);
				const previousTier =
					teamSeason.divisionId === undefined
						? undefined
						: tierByDivisionId.get(teamSeason.divisionId);
				strategyPlan = buildWorldClubStrategyForRoster({
					players: playersOnRoster,
					wageBudget,
					tier,
					previousTier,
					teamStrategy: t.strategy,
					boardObjectiveKind: teamSeason.boardObjective?.kind,
					cash: teamSeason.cash,
				});
				const focus = getClubRecruitmentFocus({
					teamStrategy: t.strategy,
					boardObjectiveKind: teamSeason.boardObjective?.kind,
					clubStrategy: strategyPlan.strategy,
				});
				const clubCountryId =
					t.divisionId === undefined
						? undefined
						: countryIdByDivisionId.get(t.divisionId);
				playersForTeam = orderBy(
					playersSorted,
					(candidate) =>
						getWorldWageMarketRecruitmentScore({
							focus,
							value: candidate.value,
							valueNoPot: candidate.valueNoPot,
							local:
								clubCountryId !== undefined &&
								countryIdByPlayerCountry.get(
									candidate.born.loc.toLocaleLowerCase(),
								) === clubCountryId,
						}),
					"desc",
				);
			}
		}
		const movementSquadPlan =
			wageBudget !== undefined
				? buildClubSquadPlan({
						rosterValues: playersOnRoster.map(
							(rosterPlayer) => rosterPlayer.valueNoPot,
						),
						wageBudget,
						minContract: g.get("minContract"),
						minimumRosterSize: g.get("minRosterSize"),
						maxRosterSize: g.get("maxRosterSize"),
						rotationSize: 2 * g.get("numPlayersOnCourt"),
					})
				: undefined;
		const squadPlan = isLowerTier ? movementSquadPlan : undefined;

		// Storytelling (Phase 6b): players take less to join a bigger club and ask
		// more of a smaller one. Asking wages are set for this club while it
		// decides, and put back for everyone it doesn't sign.
		const wageFactor =
			wageBudget !== undefined && t.worldStature !== undefined
				? getStatureWageFactor(t.worldStature)
				: 1;
		const askingWages = new Map(
			playersForTeam.map((candidate) => [candidate, candidate.contract.amount]),
		);
		if (wageFactor !== 1) {
			for (const candidate of playersForTeam) {
				candidate.contract.amount = Math.max(
					g.get("minContract"),
					helpers.roundContract(candidate.contract.amount * wageFactor),
				);
			}
		}

		const p = getBest(
			playersOnRoster,
			playersForTeam,
			payroll,
			squadPlan
				? getWageBudgetAfterMinimumRosterReserve({
						wageBudget: squadPlan.wageBudget,
						minContract: squadPlan.minContract,
						minimumRosterSize: squadPlan.minimumRosterSize,
						rosterSizeAfterSigning: squadPlan.rosterSize + 1,
					})
				: wageBudget,
			squadPlan
				? (candidate) =>
						evaluatePlayerForClubSquadPlan({
							plan: squadPlan,
							playerValue: candidate.valueNoPot,
						}).contractLimit
				: undefined,
			strategyPlan && wageBudget !== undefined
				? (candidate) =>
						canAddContractToWorldClubStrategy({
							plan: strategyPlan,
							amount: candidate.contract.amount,
							exp: candidate.contract.exp,
							wageBudget,
							minContract: g.get("minContract"),
							minimumRosterSize: g.get("minRosterSize"),
						})
				: undefined,
		);
		if (wageFactor !== 1) {
			for (const [candidate, amount] of askingWages) {
				if (candidate !== p) {
					candidate.contract.amount = amount;
				}
			}
		}

		if (p) {
			// Remove from list of free agents
			playersSorted = playersSorted.filter((p2) => p2 !== p);

			await player.sign(p, t.tid, p.contract, g.get("phase"));
			if (strategyPlan && movementSquadPlan) {
				const { role } = evaluatePlayerForClubSquadPlan({
					plan: movementSquadPlan,
					playerValue: p.valueNoPot,
				});
				p.playingTimePromise = getWorldPlayingTimePromise({
					strategy: strategyPlan.strategy,
					role,
					age: g.get("season") - p.born.year,
					season: g.get("season"),
					phase: g.get("phase"),
				});
			}
			await idb.cache.players.put(p);
			await team.rosterAutoSort(t.tid);
		}
	}
};

export default autoSign;
