import { PHASE, PLAYER, RATINGS } from "../../../common/constants.ts";
import type { Player, PlayerWithoutKey } from "../../../common/types.ts";
import { last } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { finances, player, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { getNumPlayersTradedAwayNormalizedAll } from "../player/getNumPlayersTradedAwayNormalized.ts";
import { dropPlayers } from "../team/checkRosterSizes.ts";
import { buildWorldClubStrategyForRoster } from "./buildClubSummerPlanForRoster.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getClubRecruitmentFocus } from "./clubSquadPlan.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { makePlayersMostlyLocal } from "./localPlayers.ts";
import teamLink from "./teamLink.ts";
import { getWageBudgets } from "./wageBudgets.ts";
import {
	GOLDEN_GENERATION_SETTINGS,
	academyPlayerDevelops,
	allocateAcademyProspects,
	getAcademyAges,
	getAcademyCohortSeasons,
	getAcademyContract,
	getAcademyDraftYear,
	getAcademyIntakeSize,
	getAcademyStrength,
	pickGoldenGenerationClub,
	planAcademyPromotions,
} from "./youthAcademy.ts";
import { getWorldAcademyInfrastructureBonus } from "./worldInfrastructure.ts";

type AcademyClub = {
	tid: number;
	strength: number;
};

const isWorld = () => !isSingleDivision(getCompetitionStructure());

/**
 * The academy players in a World, every club's or just one club's. They're
 * ZenGM draft prospects (PLAYER.UNDRAFTED), which keeps them off first-team
 * rosters, payrolls, and games, with academyTid saying whose academy they're
 * in and draft.year the season they have to leave it in.
 */
export const getAcademyPlayers = async (tid?: number) => {
	if (!isWorld()) {
		return [];
	}

	const prospects = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.UNDRAFTED,
	);
	return prospects.filter(
		(p) =>
			p.academyTid !== undefined && (tid === undefined || p.academyTid === tid),
	);
};

/**
 * How many academy players there are and the best prospect among them, with
 * ratings fuzzed by the user's scouting like on the academy page
 */
export const summarizeAcademyPlayers = async (players: Player[]) => {
	const playersPlus = await idb.getCopies.playersPlus(players, {
		attrs: ["pid", "firstName", "lastName", "age", "valueFuzz"],
		ratings: ["ovr", "pot", "pos"],
		season: g.get("season"),
		showNoStats: true,
		showRookies: true,
		fuzz: true,
	});

	const best = playersPlus.sort((a, b) => b.valueFuzz - a.valueFuzz)[0];

	return {
		numPlayers: players.length,
		best: best
			? {
					pid: best.pid as number,
					name: `${best.firstName} ${best.lastName}`,
					age: best.age as number,
					ovr: best.ratings.ovr as number,
					pot: best.ratings.pot as number,
					pos: best.ratings.pos as string,
				}
			: undefined,
	};
};

export const getAcademyClubs = async () => {
	const tierByDivisionId = new Map(
		getCompetitionStructure().competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);

	const clubs: AcademyClub[] = [];
	for (const t of await idb.cache.teams.getAll()) {
		if (t.disabled) {
			continue;
		}

		const scoutingLevel = await finances.getLevelLastThree("scouting", {
			t,
			tid: t.tid,
		});
		const tier =
			t.divisionId === undefined
				? undefined
				: tierByDivisionId.get(t.divisionId);
		clubs.push({
			tid: t.tid,
			strength: getAcademyStrength({
				scoutingLevel,
				tier: tier ?? 1,
				infrastructureBonus:
					t.worldInfrastructure === undefined
						? 0
						: getWorldAcademyInfrastructureBonus(
								t.worldInfrastructure.academy.level,
							),
			}),
		});
	}

	return clubs;
};

/**
 * International Soccer Zen GM mod (storytelling, Phase 6): a golden generation
 * is news at the club and a story in the World
 */
const reportGoldenGeneration = async (
	tid: number,
	prospects: { academyTid?: number; ratings: { pot: number }[] }[],
	graduationSeason: number,
) => {
	const best = Math.max(
		0,
		...prospects
			.filter((p) => p.academyTid === tid)
			.map((p) => p.ratings.at(-1)?.pot ?? 0),
	);
	const t = await idb.cache.teams.get(tid);
	const countryId =
		getCompetitionStructure().competitionDivisions.find(
			(division) => division.divisionId === t?.divisionId,
		)?.countryId ?? 0;

	logEvent({
		type: "story",
		text: `The ${teamLink(tid)} have taken in a golden generation: the best group their academy has ever seen, due to graduate in ${graduationSeason}.`,
		tids: [tid],
		score: 25,
		showNotification: tid === g.get("userTid"),
		hideInLiveGame: true,
		story: {
			kind: "goldenGeneration",
			countryId,
			significance: 50,
			facts: { graduationSeason, bestPotential: best },
		},
	});
};

/**
 * Generates one intake of academy players, who have to graduate in the summer
 * of `graduationSeason`, and shares it out between the clubs. When academies
 * are filled from scratch, older intakes are developed to their ages.
 */
const addIntake = async (
	graduationSeason: number,
	clubs: AcademyClub[],
	// Storytelling (Phase 6): one club's intake this summer can be a golden
	// generation (see GOLDEN_GENERATION_SETTINGS)
	golden = false,
) => {
	const season = g.get("season");
	const { intakeAge, graduationAge } = getAcademyAges(g.get("draftAges"));
	const age = graduationAge - (graduationSeason - season);

	// Like draft prospects, their ratings are fuzzed by the user's scouting
	const scoutingLevel = await finances.getLevelLastThree("scouting", {
		tid: g.get("userTid"),
	});

	const prospects: PlayerWithoutKey[] = [];
	for (let i = 0; i < getAcademyIntakeSize(clubs.length); i++) {
		const p = player.generate(
			PLAYER.UNDRAFTED,
			intakeAge,
			graduationSeason,
			false,
			scoutingLevel,
			await player.name(),
		);

		// A draft prospect's only ratings row is dated to his draft year, but
		// academy players get a new row every season they develop
		p.ratings[0].season = season;

		// Just for ovr/pot
		await player.develop(p, 0);
		for (let years = intakeAge; years < age; years++) {
			// Like in the preseason, only once he's old enough to. Developing a new
			// player ages him too, so a year without development still has to.
			if (academyPlayerDevelops(years + 1, g.get("draftAges"))) {
				await player.develop(p, 1, true);
			} else {
				p.born.year -= 1;
			}
		}
		if (age > intakeAge) {
			// ovr/pot at his real age
			await player.develop(p, 0);
		}

		prospects.push(p);
	}

	const goldenTid = golden
		? pickGoldenGenerationClub(clubs.map((club) => club.tid))
		: undefined;
	const tids = allocateAcademyProspects({
		pots: prospects.map((p) => last(p.ratings).pot),
		clubs,
		goldenTid,
	});
	for (const [i, p] of prospects.entries()) {
		p.academyTid = tids[i];
	}

	// A golden generation's prospects are better than any intake usually is
	if (goldenTid !== undefined) {
		for (const p of prospects) {
			if (p.academyTid !== goldenTid) {
				continue;
			}
			const ratings = last(p.ratings) as unknown as Record<string, number>;
			for (const key of RATINGS) {
				const rating = ratings[key];
				if (typeof rating === "number") {
					ratings[key] = helpers.bound(
						rating + GOLDEN_GENERATION_SETTINGS.ratingBoost,
						0,
						100,
					);
				}
			}
			await player.develop(p, 0);
		}
		await reportGoldenGeneration(goldenTid, prospects, graduationSeason);
	}

	// Most of a club's academy players are from its Country
	await makePlayersMostlyLocal(
		prospects,
		(p) => p.academyTid,
		await idb.cache.teams.getAll(),
	);

	for (const p of prospects) {
		await idb.cache.players.add(p);

		// idb.cache.players.add will create the "pid" property, transforming PlayerWithoutKey to Player
		// @ts-expect-error
		await player.addRelatives(p);

		await player.updateValues(p);
	}

	return prospects as Player[];
};

/**
 * Like youth intake day in Football Manager: the user hears how many players
 * joined their academy and who the pick of them is
 */
const reportUserIntakes = async (intake: Player[]) => {
	for (const tid of g.get("userTids")) {
		const academyUrl = helpers.leagueUrl([
			"academy",
			`${g.get("teamInfoCache")[tid]?.abbrev}_${tid}`,
		]);
		const { numPlayers, best } = await summarizeAcademyPlayers(
			intake.filter((p) => p.academyTid === tid),
		);

		let text;
		if (!best) {
			text = `No new players joined your <a href="${academyUrl}">academy</a> this year.`;
		} else {
			const ratings = g.get("challengeNoRatings")
				? ""
				: `, ${best.ovr} ovr, ${best.pot} pot`;
			text = `Youth intake day: ${numPlayers} new ${
				numPlayers === 1 ? "player has" : "players have"
			} joined your <a href="${academyUrl}">academy</a>. The pick of them is <a href="${helpers.leagueUrl(
				["player", best.pid],
			)}">${best.name}</a> (${best.pos}, age ${best.age}${ratings}).`;
		}

		await logEvent({
			type: "academy",
			text,
			showNotification: true,
			pids: best ? [best.pid] : [],
			tids: [tid],
		});
	}
};

/**
 * Fills a World's academies from scratch, with an intake for every age they
 * cover, if no club has any academy players: a new World, or one from before
 * academies existed. Returns whether it did.
 */
export const ensureAcademies = async () => {
	if (!isWorld() || (await getAcademyPlayers()).length > 0) {
		return false;
	}

	const clubs = await getAcademyClubs();
	if (clubs.length === 0) {
		return false;
	}

	const { numCohorts } = getAcademyAges(g.get("draftAges"));
	for (const graduationSeason of getAcademyCohortSeasons({
		season: g.get("season"),
		phase: g.get("phase"),
		numCohorts,
	})) {
		await addIntake(graduationSeason, clubs);
	}

	return true;
};

/**
 * International Soccer Zen GM mod (Epic 8): a club joining a World (like an
 * expansion club) gets a full academy straight away, one intake for each age,
 * instead of waiting for next summer's intake
 */
export const fillAcademyForNewClub = async (tid: number) => {
	if (!isWorld() || (await getAcademyPlayers(tid)).length > 0) {
		return;
	}

	const club = (await getAcademyClubs()).find((club) => club.tid === tid);
	if (!club) {
		return;
	}

	const { numCohorts } = getAcademyAges(g.get("draftAges"));
	for (const graduationSeason of getAcademyCohortSeasons({
		season: g.get("season"),
		phase: g.get("phase"),
		numCohorts,
	})) {
		await addIntake(graduationSeason, [club]);
	}
};

/**
 * Moves an academy player up to his club's first team, on a minimum-wage rookie
 * contract (see getAcademyContract)
 */
export const promoteAcademyPlayer = async (p: Player, tid: number) => {
	const season = g.get("season");
	const phase = g.get("phase");
	const { ovr, pot, skills } = last(p.ratings);

	p.tid = tid;
	delete p.academyTid;
	p.draft = {
		round: 0,
		pick: 0,
		tid,
		originalTid: tid,
		year: getAcademyDraftYear(season, phase),
		pot,
		ovr,
		skills,
	};
	player.setContract(
		p,
		getAcademyContract({ season, phase, minContract: g.get("minContract") }),
		true,
	);

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
		type: "academy",
		text: `The ${teamLink(tid)} promoted <a href="${helpers.leagueUrl([
			"player",
			p.pid,
		])}">${p.firstName} ${p.lastName}</a> from their academy to the first team.`,
		showNotification: false,
		pids: [p.pid],
		tids: [tid],
		score: 0,
	});

	p.transactions ??= [];
	p.transactions.push({
		season,
		phase,
		tid,
		type: "academy",
		eid,
	});

	await idb.cache.players.put(p);
};

// The summer academy step runs in the draft phase, before re-signing starts,
// when ZenGM makes this season's undrafted prospects free agents
const release = async (p: Player) => {
	delete p.academyTid;
	p.draft.year = g.get("season");
	await idb.cache.players.put(p);
};

/**
 * Releases an academy player straight to free agency, where any club can sign
 * him
 */
export const releaseAcademyPlayer = async (p: Player) => {
	const tid = p.academyTid;
	delete p.academyTid;
	p.draft.year = g.get("season");
	await player.addToFreeAgents(p, await getNumPlayersTradedAwayNormalizedAll());
	await idb.cache.players.put(p);

	if (tid !== undefined) {
		await logEvent({
			type: "release",
			text: `The ${teamLink(tid)} released <a href="${helpers.leagueUrl([
				"player",
				p.pid,
			])}">${p.firstName} ${p.lastName}</a> from their academy.`,
			showNotification: false,
			pids: [p.pid],
			tids: [tid],
		});
	}
};

/**
 * International Soccer Zen GM mod (Epic 6): when free agency starts, graduates
 * still in an academy become free agents. AI clubs decide on theirs in the
 * draft phase, so these are the user's graduates they didn't promote or release
 * during re-signing.
 */
export const releaseUndecidedGraduates = async () => {
	const season = g.get("season");
	for (const p of await getAcademyPlayers()) {
		if (p.draft.year <= season) {
			await releaseAcademyPlayer(p);
		}
	}
};

/**
 * International Soccer Zen GM mod (Epic 5): a World's youth academies take the
 * place of ZenGM's draft classes. Every summer, in the draft phase, clubs
 * promote academy players to their first teams (see planAcademyPromotions),
 * graduates who aren't promoted become free agents, and a new intake joins.
 */
const doAcademySummer = async () => {
	if (!isWorld() || (await ensureAcademies())) {
		return;
	}

	const season = g.get("season");
	const maxRosterSize = g.get("maxRosterSize");
	const clubs = await getAcademyClubs();
	const teamsByTid = new Map(
		(await idb.cache.teams.getAll()).map((t) => [t.tid, t]),
	);
	const wageBudgets = await getWageBudgets();
	const tierByDivisionId = new Map(
		getCompetitionStructure().competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	const academyPlayersByTid = Map.groupBy(
		await getAcademyPlayers(),
		(p) => p.academyTid!,
	);

	// Same as AI transfers: the AI runs the user's clubs during auto play and in
	// spectator mode
	const aiRunsUserClubs = !!local.autoPlayUntil || g.get("spectator");

	for (const { tid } of clubs) {
		const academyPlayers = academyPlayersByTid.get(tid) ?? [];
		academyPlayersByTid.delete(tid);
		if (academyPlayers.length === 0) {
			continue;
		}

		// The user runs their own academy on the academy page, and their graduates
		// wait until free agency starts (see releaseUndecidedGraduates)
		if (g.get("userTids").includes(tid) && !aiRunsUserClubs) {
			const numGraduates = academyPlayers.filter(
				(p) => p.draft.year <= season,
			).length;
			if (numGraduates > 0) {
				await logEvent({
					type: "academy",
					text: `${numGraduates} of your academy players ${
						numGraduates === 1 ? "is" : "are"
					} graduating. <a href="${helpers.leagueUrl([
						"academy",
						`${g.get("teamInfoCache")[tid]?.abbrev}_${tid}`,
					])}">Promote or release your graduates</a> before free agency starts. Any you haven't decided on by then become free agents.`,
					showNotification: true,
					tids: [tid],
				});
			}
			continue;
		}

		const t = teamsByTid.get(tid);
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, tid],
		);
		const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
		const wageBudget = wageBudgets.get(tid);
		const currentTier =
			t?.divisionId === undefined
				? 1
				: (tierByDivisionId.get(t.divisionId) ?? 1);
		const previousTier =
			teamSeason?.divisionId === undefined
				? undefined
				: tierByDivisionId.get(teamSeason.divisionId);
		const strategyPlan =
			t && teamSeason && wageBudget !== undefined
				? buildWorldClubStrategyForRoster({
						players: roster,
						wageBudget,
						tier: currentTier,
						previousTier,
						teamStrategy: t.strategy,
						boardObjectiveKind: teamSeason.boardObjective?.kind,
						cash: teamSeason.cash,
					})
				: undefined;
		const plan = planAcademyPromotions({
			prospects: academyPlayers.map((p) => ({
				pid: p.pid,
				value: p.value,
				valueNoPot: p.valueNoPot,
				graduating: p.draft.year <= season,
			})),
			roster: roster.map((p) => ({
				value: p.value,
				valueNoPot: p.valueNoPot,
			})),
			minRosterSize: g.get("minRosterSize"),
			maxRosterSize,
			// Twice the players on court, a basketball rotation
			rotationSize: 2 * g.get("numPlayersOnCourt"),
			recruitmentFocus:
				t && teamSeason
					? getClubRecruitmentFocus({
							teamStrategy: t.strategy,
							boardObjectiveKind: teamSeason.boardObjective?.kind,
							clubStrategy: strategyPlan?.strategy,
						})
					: "potential",
		});

		const byPid = new Map(academyPlayers.map((p) => [p.pid, p]));
		for (const pid of plan.promote) {
			await promoteAcademyPlayer(byPid.get(pid)!, tid);
		}
		for (const pid of plan.release) {
			await release(byPid.get(pid)!);
		}

		if (plan.promote.length > 0) {
			// An AI club makes room right away by releasing its worst players, as
			// it would before the regular season anyway (see
			// team.checkRosterSizes). Otherwise its roster stays over the limit all
			// summer, which stops it buying or signing anyone.
			const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
			if (roster.length > maxRosterSize) {
				await dropPlayers(roster, roster.length - maxRosterSize);
			}

			await team.rosterAutoSort(tid, true);
		}
	}

	// Academies of clubs that no longer exist
	for (const academyPlayers of academyPlayersByTid.values()) {
		for (const p of academyPlayers) {
			await release(p);
		}
	}

	// Promotions and releases change draft.year, which is part of a database
	// index. Adding relatives to the new intake looks players up by draft year,
	// merging the database with the cache by pid, so without this it can find a
	// promoted player's old database copy and save it back over his promotion.
	await idb.cache.flush();

	const { numCohorts } = getAcademyAges(g.get("draftAges"));
	const intake = await addIntake(season + numCohorts, clubs, true);
	if (!aiRunsUserClubs) {
		await reportUserIntakes(intake);
	}

	await toUI("realtimeUpdate", [["playerMovement"]]);
};

export default doAcademySummer;
