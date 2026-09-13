import { PHASE, PLAYER } from "../../../common/constants.ts";
import type { Player, PlayerWithoutKey } from "../../../common/types.ts";
import { last } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import { finances, player, team } from "../index.ts";
import { getTeammateJerseyNumbers } from "../player/genJerseyNumber.ts";
import { dropPlayers } from "../team/checkRosterSizes.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import teamLink from "./teamLink.ts";
import {
	allocateAcademyProspects,
	getAcademyAges,
	getAcademyCohortSeasons,
	getAcademyContract,
	getAcademyDraftYear,
	getAcademyIntakeSize,
	getAcademyStrength,
	planAcademyPromotions,
} from "./youthAcademy.ts";

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

const getAcademyClubs = async () => {
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
			strength: getAcademyStrength({ scoutingLevel, tier: tier ?? 1 }),
		});
	}

	return clubs;
};

/**
 * Generates one intake of academy players, who have to graduate in the summer
 * of `graduationSeason`, and shares it out between the clubs. When academies
 * are filled from scratch, older intakes are developed to their ages.
 */
const addIntake = async (graduationSeason: number, clubs: AcademyClub[]) => {
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
			await player.develop(p, 1, true);
		}

		prospects.push(p);
	}

	const tids = allocateAcademyProspects({
		pots: prospects.map((p) => last(p.ratings).pot),
		clubs,
	});
	for (const [i, p] of prospects.entries()) {
		p.academyTid = tids[i];
		await idb.cache.players.add(p);

		// idb.cache.players.add will create the "pid" property, transforming PlayerWithoutKey to Player
		// @ts-expect-error
		await player.addRelatives(p);

		await player.updateValues(p);
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

const promote = async (p: Player, tid: number) => {
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

		const userControlled = g.get("userTids").includes(tid) && !aiRunsUserClubs;
		const plan = planAcademyPromotions({
			prospects: academyPlayers.map((p) => ({
				pid: p.pid,
				value: p.value,
				valueNoPot: p.valueNoPot,
				graduating: p.draft.year <= season,
			})),
			roster: (await idb.cache.players.indexGetAll("playersByTid", tid)).map(
				(p) => ({
					value: p.value,
					valueNoPot: p.valueNoPot,
				}),
			),
			minRosterSize: g.get("minRosterSize"),
			maxRosterSize,
			// Twice the players on court, a basketball rotation
			rotationSize: 2 * g.get("numPlayersOnCourt"),
			userControlled,
		});

		const byPid = new Map(academyPlayers.map((p) => [p.pid, p]));
		for (const pid of plan.promote) {
			await promote(byPid.get(pid)!, tid);
		}
		for (const pid of plan.release) {
			await release(byPid.get(pid)!);
		}

		if (plan.promote.length > 0) {
			// An AI club makes room right away by releasing its worst players, as
			// it would before the regular season anyway (see
			// team.checkRosterSizes). Otherwise its roster stays over the limit all
			// summer, which stops it buying or signing anyone.
			if (!userControlled) {
				const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
				if (roster.length > maxRosterSize) {
					await dropPlayers(roster, roster.length - maxRosterSize);
				}
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
	await addIntake(season + numCohorts, clubs);

	await toUI("realtimeUpdate", [["playerMovement"]]);
};

export default doAcademySummer;
