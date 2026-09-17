import { PHASE, PLAYER } from "../../../common/constants.ts";
import { choice, randInt } from "../../../common/random.ts";
import type {
	Player,
	PlayerWithoutKey,
	TeamSeason,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { loadNames } from "../../util/loadNames.ts";
import { recomputeLocalUITeamOvrs } from "../../util/recomputeLocalUITeamOvrs.ts";
import { finances, league, player, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { getCurrentTransferWindow } from "./aiTransfers.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { aiWouldBorrow } from "./loans.ts";
import {
	getTalentPoolKey,
	getTalentPoolSize,
	pickTalentPoolCountry,
	TALENT_POOL_FEE_SEASONS,
	TALENT_POOL_MAX_AGE,
	TALENT_POOL_MIN_AGE,
} from "./talentPool.ts";
import teamLink from "./teamLink.ts";
import {
	canAffordFee,
	canAiAffordFee,
	getTransferFee,
} from "./transferMarket.ts";
import { getWageBudgets } from "./wageBudgets.ts";
import {
	buildClubSquadPlan,
	canAddContractAfterMinimumRosterReserve,
	evaluatePlayerForClubSquadPlan,
	getClubRecruitmentFocus,
	getRecruitmentCandidateScore,
} from "./clubSquadPlan.ts";

// International Soccer Zen GM mod (Epic 4): moving players in and out of the
// international talent pool (see competition/talentPool.ts). Pool players are
// draft prospects (PLAYER.UNDRAFTED) with talentPool saying which window's pool
// they're in, which keeps them off rosters, payrolls, and games.

const isWorld = () => !isSingleDivision(getCompetitionStructure());

const formatFee = (fee: number) => helpers.formatCurrency(fee / 1000, "M");

const getCurrentTalentPoolKey = async () => {
	const window = await getCurrentTransferWindow();
	if (window === undefined) {
		return;
	}
	return getTalentPoolKey({
		season: g.get("season"),
		phase: g.get("phase"),
		window,
	});
};

/** The players in the talent pool of the transfer window open now, if any */
export const getTalentPoolPlayers = async () => {
	if (!isWorld()) {
		return [];
	}

	const key = await getCurrentTalentPoolKey();
	if (key === undefined) {
		return [];
	}

	return (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.UNDRAFTED)
	).filter((p) => p.talentPool === key);
};

/** What a pool player signs for, his market wage (see player.genContract) */
export const getTalentPoolWage = (p: PlayerWithoutKey) =>
	player.genContract(p, false).amount;

/** A pool player's fee, thousands of dollars (see TALENT_POOL_FEE_SEASONS) */
export const getTalentPoolFee = (p: PlayerWithoutKey) =>
	getTransferFee({
		marketWage: getTalentPoolWage(p),
		age: g.get("season") - p.born.year,
		seasonsLeft: TALENT_POOL_FEE_SEASONS,
	});

/**
 * Pool players nobody signed leave once their window has closed. Run every day
 * with the AI transfers, and in the draft phase, since a winter window can close
 * at the trade deadline, after which there are no more AI transfer days that
 * season.
 */
export const removeStaleTalentPool = async () => {
	if (!isWorld()) {
		return;
	}

	const key = await getCurrentTalentPoolKey();
	const pids = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.UNDRAFTED)
	)
		.filter((p) => p.talentPool !== undefined && p.talentPool !== key)
		.map((p) => p.pid);
	await player.remove(pids);
};

const addPoolPlayer = async ({
	key,
	excluded,
	scoutingLevel,
}: {
	key: string;
	excluded: ReadonlySet<string>;
	scoutingLevel: number;
}) => {
	if (local.playerBioInfo === undefined) {
		local.playerBioInfo = await loadNames();
	}

	const season = g.get("season");
	const draftAge = g.get("draftAges")[0];
	const minAge = Math.max(TALENT_POOL_MIN_AGE, draftAge);
	const age = randInt(minAge, Math.max(minAge, TALENT_POOL_MAX_AGE));

	// Without a nation outside the World in the name data, the worldwide mix
	const country = pickTalentPoolCountry(
		local.playerBioInfo.frequencies,
		excluded,
	);

	const p = player.generate(
		PLAYER.UNDRAFTED,
		draftAge,
		season,
		false,
		scoutingLevel,
		await player.name(country),
	);

	// Like an academy player, his only ratings row is this season's, and he's
	// developed to his age from the ratings of a prospect at the first draft age
	p.ratings[0].season = season;
	await player.develop(p, 0);
	if (age > draftAge) {
		await player.develop(p, age - draftAge, true);
		await player.develop(p, 0);
	}
	p.talentPool = key;

	await idb.cache.players.add(p);
	await player.updateValues(p);
};

/**
 * When a transfer window opens, its talent pool arrives: getTalentPoolSize
 * players from nations without a league in the World (see
 * pickTalentPoolCountry), aged TALENT_POOL_MIN_AGE to TALENT_POOL_MAX_AGE, with
 * ratings like any player that age. It only arrives once a window, so players
 * signed from it aren't replaced.
 */
export const ensureTalentPool = async () => {
	if (!isWorld() || g.get("forceHistoricalRosters")) {
		return;
	}

	const window = await getCurrentTransferWindow();
	if (window === undefined) {
		return;
	}
	const key = getTalentPoolKey({
		season: g.get("season"),
		phase: g.get("phase"),
		window,
	});
	if ((g as unknown as { talentPoolKey?: string }).talentPoolKey === key) {
		return;
	}

	await removeStaleTalentPool();

	// Like draft prospects, their ratings are fuzzed by the user's scouting
	const scoutingLevel = await finances.getLevelLastThree("scouting", {
		tid: g.get("userTid"),
	});
	const excluded = new Set(
		getCompetitionStructure().countries.flatMap((country) => [
			country.name,
			...(country.nameCountries ?? []),
		]),
	);
	const size = getTalentPoolSize(g.get("numActiveTeams"));
	for (let i = 0; i < size; i++) {
		await addPoolPlayer({ key, excluded, scoutingLevel });
	}
	await league.setGameAttributes({ talentPoolKey: key });

	if (size > 0 && !local.autoPlayUntil && !g.get("spectator")) {
		await logEvent({
			type: "transfer",
			text: `${size} players from abroad have joined the international talent pool. Any club can sign them for a fee until the ${window} transfer window closes. <a href="${helpers.leagueUrl(
				["transfer_market"],
			)}">Transfer market</a>`,
			showNotification: true,
			tids: g.get("userTids"),
		});
	}

	await toUI("realtimeUpdate", [["playerMovement"]]);
};

/**
 * A club signs a pool player: it pays his fee, which goes to his club abroad,
 * and he signs a new contract at his market wage
 */
const signFromTalentPool = async ({
	p,
	tid,
	fee,
	teamSeason,
}: {
	p: Player;
	tid: number;
	fee: number;
	teamSeason: TeamSeason;
}) => {
	const season = g.get("season");
	const phase = g.get("phase");

	teamSeason.cash -= fee;
	await idb.cache.teamSeasons.put(teamSeason);

	p.tid = tid;
	delete p.talentPool;
	player.setContract(p, player.genContract(p, false), true);
	p.ptModifier = 1;
	// Like a newly signed player, so he isn't sold on again straight away
	p.gamesUntilTradable = Math.round(0.17 * g.get("numGames"));
	if (phase <= PHASE.PLAYOFFS) {
		player.setJerseyNumber(
			p,
			await player.genJerseyNumber(
				p,
				await getTeammateJerseyNumbers(tid, [p.pid]),
			),
		);
	}

	const eid = await logEvent({
		type: "transfer",
		text: `The ${teamLink(tid)} signed <a href="${helpers.leagueUrl([
			"player",
			p.pid,
		])}">${p.firstName} ${p.lastName}</a> from ${p.born.loc} for ${
			fee > 0 ? formatFee(fee) : "free"
		}.`,
		showNotification: false,
		pids: [p.pid],
		tids: [tid],
		score: Math.round(helpers.bound(p.valueFuzz - 40, 0, Infinity)),
	});

	p.transactions ??= [];
	p.transactions.push({
		season,
		phase,
		tid,
		type: "talentPool",
		fee,
		eid,
	});
	await idb.cache.players.put(p);

	// Like ZenGM trades, the user's rosters are only sorted if they asked for it
	const t = await idb.cache.teams.get(tid);
	if (!g.get("userTids").includes(tid) || t?.keepRosterSorted) {
		await team.rosterAutoSort(tid);
	}
};

/**
 * AI clubs (`aiTids`) try up to `numAttempts` times to sign pool players who'd
 * be in their rotation, like borrowing (see aiWouldBorrow), with room on their
 * roster and in their wage budget, and the cash for the fee. Returns how many
 * were signed.
 */
export const aiTalentPoolSignings = async (
	numAttempts: number,
	aiTids: number[],
) => {
	if (numAttempts <= 0 || aiTids.length === 0) {
		return 0;
	}

	const pool = await getTalentPoolPlayers();
	if (pool.length === 0) {
		return 0;
	}

	const season = g.get("season");
	const rotationSize = 2 * g.get("numPlayersOnCourt");
	const wageBudgets = await getWageBudgets();
	const structure = getCompetitionStructure();
	const tierByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	const teamsByTid = new Map(
		(await idb.cache.teams.getAll()).map((t) => [t.tid, t]),
	);

	let numSigned = 0;
	for (let i = 0; i < numAttempts; i++) {
		const tid = choice(aiTids);
		if (tid === undefined) {
			continue;
		}
		const t = teamsByTid.get(tid);
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, tid],
		);
		if (!t || !teamSeason) {
			continue;
		}
		const recruitmentFocus = getClubRecruitmentFocus({
			teamStrategy: t.strategy,
			boardObjectiveKind: teamSeason.boardObjective?.kind,
		});
		const p = choice(
			pool.filter((p) => p.talentPool !== undefined),
			(p) =>
				getRecruitmentCandidateScore({
					focus: recruitmentFocus,
					value: p.value,
					valueNoPot: p.valueNoPot,
				}),
		);
		if (!p) {
			continue;
		}

		const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
		const wageBudget = wageBudgets.get(tid);
		if (wageBudget === undefined) {
			continue;
		}
		const movementSquadPlan = buildClubSquadPlan({
			wageBudget,
			minContract: g.get("minContract"),
			rosterValues: roster.map((other) => other.valueNoPot),
			minimumRosterSize: g.get("minRosterSize"),
			maxRosterSize: g.get("maxRosterSize"),
			rotationSize,
		});
		if (
			roster.length >= g.get("maxRosterSize") ||
			!aiWouldBorrow({
				valueNoPot: p.valueNoPot,
				squadPlan: movementSquadPlan,
			})
		) {
			continue;
		}

		const wage = getTalentPoolWage(p);
		const tier =
			t?.divisionId === undefined
				? 1
				: (tierByDivisionId.get(t.divisionId) ?? 1);
		const squadPlan = tier > 1 ? movementSquadPlan : undefined;
		const roleLimit = squadPlan
			? evaluatePlayerForClubSquadPlan({
					plan: squadPlan,
					playerValue: p.valueNoPot,
				}).contractLimit
			: Infinity;
		if (
			wage > roleLimit ||
			!canAddContractAfterMinimumRosterReserve({
				payroll: await team.getPayroll(tid),
				amount: wage,
				wageBudget,
				minContract: g.get("minContract"),
				minimumRosterSize: g.get("minRosterSize"),
				rosterSize: roster.length,
			})
		) {
			continue;
		}

		const fee = getTalentPoolFee(p);
		if (!canAiAffordFee({ cash: teamSeason.cash, fee })) {
			continue;
		}

		await signFromTalentPool({ p, tid, fee, teamSeason });
		numSigned += 1;
	}

	return numSigned;
};

export type TalentPoolSigningResult = {
	type: "accept" | "error";
	message: string;
};

/**
 * The user signs a player from the talent pool, with the same roster, wage
 * budget, and debt limits as a transfer
 */
export const signTalentPoolPlayer = async ({
	pid,
}: {
	pid: number;
}): Promise<TalentPoolSigningResult> => {
	const error = (message: string) => ({ type: "error" as const, message });

	if (!isWorld()) {
		return error("The talent pool only exists in a World.");
	}
	if (g.get("spectator")) {
		return error("You can't sign players in spectator mode.");
	}
	const key = await getCurrentTalentPoolKey();
	if (key === undefined) {
		return error("The transfer window is closed.");
	}

	const p = await idb.cache.players.get(pid);
	if (!p || p.tid !== PLAYER.UNDRAFTED || p.talentPool !== key) {
		return error("That player isn't in the talent pool any more.");
	}

	const userTid = g.get("userTid");
	const name = `${p.firstName} ${p.lastName}`;

	const roster = await idb.cache.players.indexGetAll("playersByTid", userTid);
	if (roster.length >= g.get("maxRosterSize")) {
		return error("Your roster is full. Release a player before signing one.");
	}

	const wageBudget = (await getWageBudgets()).get(userTid);
	const teamSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsBySeasonTid",
		[g.get("season"), userTid],
	);
	if (wageBudget === undefined || !teamSeason) {
		return error("Your club has no season to sign players in.");
	}

	const wage = getTalentPoolWage(p);
	if ((await team.getPayroll(userTid)) + wage > wageBudget) {
		return error(
			`Your board won't let ${name}'s wages of ${formatFee(
				wage,
			)} take your payroll over your wage budget of ${formatFee(wageBudget)}.`,
		);
	}
	const userTeam = await idb.cache.teams.get(userTid);
	const structure = getCompetitionStructure();
	const tier = structure.competitionDivisions.find(
		(division) => division.divisionId === userTeam?.divisionId,
	)?.tier;
	if ((tier ?? 1) > 1) {
		const squadPlan = buildClubSquadPlan({
			wageBudget,
			minContract: g.get("minContract"),
			rosterValues: roster.map((other) => other.valueNoPot),
			minimumRosterSize: g.get("minRosterSize"),
			maxRosterSize: g.get("maxRosterSize"),
			rotationSize: 2 * g.get("numPlayersOnCourt"),
		});
		const { contractLimit, role } = evaluatePlayerForClubSquadPlan({
			plan: squadPlan,
			playerValue: p.valueNoPot,
		});
		if (wage > contractLimit) {
			return error(
				`Your board values ${name} as a ${role} squad player and will approve at most ${formatFee(
					contractLimit,
				)} a season after reserving enough wage budget for a complete squad.`,
			);
		}
		if (
			!canAddContractAfterMinimumRosterReserve({
				payroll: await team.getPayroll(userTid),
				amount: wage,
				wageBudget,
				minContract: g.get("minContract"),
				minimumRosterSize: g.get("minRosterSize"),
				rosterSize: roster.length,
			})
		) {
			return error(
				`Your board is reserving enough of the wage budget for a complete ${g.get(
					"minRosterSize",
				)}-player squad.`,
			);
		}
	}

	const fee = getTalentPoolFee(p);
	if (!canAffordFee({ cash: teamSeason.cash, fee, wageBudget })) {
		return error(
			`You can't afford ${formatFee(
				fee,
			)}. A club can only go into debt down to half its wage budget.`,
		);
	}

	await signFromTalentPool({ p, tid: userTid, fee, teamSeason });
	await toUI("realtimeUpdate", [["playerMovement"]]);
	await recomputeLocalUITeamOvrs();

	return {
		type: "accept",
		message: `You signed ${name} from ${p.born.loc} for ${formatFee(fee)}, on ${formatFee(
			p.contract.amount,
		)} a season through ${p.contract.exp}.`,
	};
};
