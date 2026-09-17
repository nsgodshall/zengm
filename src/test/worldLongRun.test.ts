import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
// @ts-expect-error
import fs from "node:fs/promises";
import { afterAll, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE, PLAYER } from "../common/constants.ts";
import { defaultGameAttributes } from "../common/defaultGameAttributes.ts";
import type { EventBBGM, Player, TeamSeason } from "../common/types.ts";
import { unwrapGameAttribute } from "../common/unwrapGameAttribute.ts";
import { competition, league, team } from "../worker/core/index.ts";
import { getWageBudgets } from "../worker/core/competition/wageBudgets.ts";
import { WORLD_REVENUE_SETTINGS } from "../worker/core/competition/worldRevenue.ts";
import { RELEGATION_CLAUSE_SETTINGS } from "../worker/core/competition/relegationClauses.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import {
	formatStoryYield,
	getStoryYieldReport,
} from "./worldLongRunStories.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import {
	getDefaultSettings,
	getWorldDefaultSettings,
} from "../worker/views/newLeague.ts";

// International Soccer Zen GM mod (Epic 8): a long run of a realistic World,
// made the way New League → World makes one, for finding problems that only
// show up over many seasons. It's slow, so it only runs when WORLD_LONG_RUN is
// the number of seasons to play, and it writes what it finds to the directory
// WORLD_LONG_RUN_REPORT instead of asserting:
//
//   WORLD_LONG_RUN=10 WORLD_LONG_RUN_REPORT=/tmp/report node --run test -- src/test/worldLongRun.test.ts

const env = (globalThis as any).process.env as Record<
	string,
	string | undefined
>;
const NUM_SEASONS = Number(env.WORLD_LONG_RUN ?? 0);
const REPORT_DIR = env.WORLD_LONG_RUN_REPORT ?? ".";
const COUNTRY_KEYS = (env.WORLD_LONG_RUN_COUNTRIES ?? "uk,spain,usa").split(
	",",
);
const STARTING_SEASON = 2026;

// WORLD_LONG_RUN_CONTROL=1 plays an ordinary ZenGM league of random players
// instead, to compare the player pool against, and skips the World analysis
const CONTROL = env.WORLD_LONG_RUN_CONTROL === "1";

// WORLD_LONG_RUN_REVENUE overrides some of WORLD_REVENUE_SETTINGS with JSON,
// for tuning them
if (env.WORLD_LONG_RUN_REVENUE) {
	Object.assign(WORLD_REVENUE_SETTINGS, JSON.parse(env.WORLD_LONG_RUN_REVENUE));
}

// WORLD_LONG_RUN_CLAUSES does the same for RELEGATION_CLAUSE_SETTINGS
if (env.WORLD_LONG_RUN_CLAUSES) {
	Object.assign(
		RELEGATION_CLAUSE_SETTINGS,
		JSON.parse(env.WORLD_LONG_RUN_CLAUSES),
	);
}

const errors: unknown[] = [];
const onUnhandledRejection = (error: unknown) => {
	errors.push(error);
};

const mean = (values: number[]) =>
	values.length === 0
		? Number.NaN
		: values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: number[], fraction: number) => {
	if (values.length === 0) {
		return Number.NaN;
	}
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.round((sorted.length - 1) * fraction)]!;
};
const round = (value: number | undefined, digits = 1) =>
	value === undefined || Number.isNaN(value)
		? "-"
		: String(Math.round(value * 10 ** digits) / 10 ** digits);

const writeReport = async (name: string, contents: unknown) => {
	await fs.mkdir(REPORT_DIR, { recursive: true });
	await fs.writeFile(
		`${REPORT_DIR}/${name}`,
		typeof contents === "string" ? contents : JSON.stringify(contents, null, 1),
	);
};

const waitFor = async (isDone: () => boolean) => {
	while (!isDone()) {
		if (errors.length > 0) {
			throw errors[0];
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
};

const playUntil = async (season: number, phase: number) => {
	local.autoPlayUntil = { season, phase, start: Date.now() };
	league.autoPlay().catch(onUnhandledRejection);
	await waitFor(
		() =>
			local.autoPlayUntil === undefined &&
			g.get("season") === season &&
			g.get("phase") === phase &&
			!lock.get("newPhase"),
	);
};

// A long run analyzes standings, team seasons, events, and player histories,
// not individual box scores. fake-indexeddb retains those large objects in the
// Node heap even after normal old-box-score cleanup, so discard them after each
// snapshot rather than requiring an 8 GB heap for a 20-season run.
const discardBoxScores = async () => {
	await idb.cache.games.clear();
	await idb.cache.flush(["games"]);
	await idb.league.clear("games");
};

const getStructureInfo = () => {
	const structure = competition.getCompetitionStructure();
	const divisionById = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division,
		]),
	);
	const countryNameById = new Map(
		structure.countries.map((country) => [country.countryId, country.name]),
	);
	return { structure, divisionById, countryNameById };
};

// The state of every club and the player pool when a regular season starts
const takeSnapshot = async () => {
	const season = g.get("season");
	const { divisionById, countryNameById } = getStructureInfo();
	const wageBudgets = await getWageBudgets();
	const players: Player[] = await idb.cache.players.getAll();
	const freeAgents = players.filter((p) => p.tid === PLAYER.FREE_AGENT);
	const freeAgentRows = freeAgents.map((p) => ({
		demand: p.contract.amount / 1000,
		ovr: p.ratings.at(-1)!.ovr,
	}));
	const minContract = g.get("minContract") / 1000;

	const clubs = [];
	for (const t of await idb.cache.teams.getAll()) {
		if (t.disabled) {
			continue;
		}
		const division = divisionById.get(t.divisionId!)!;
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, t.tid],
		);
		const roster = players.filter((p) => p.tid === t.tid);
		const rosterPlus = await idb.getCopies.playersPlus(roster, {
			attrs: ["pid", "injury", "value"],
			ratings: ["ovr", "pos", "ovrs"],
			season,
			showNoStats: true,
			showRookies: true,
		});
		const payroll = (await team.getPayroll(t.tid)) / 1000;
		const wageBudget = (wageBudgets.get(t.tid) ?? 0) / 1000;
		const contractAmounts = roster
			.map((p) => p.contract.amount / 1000)
			.sort((a, b) => b - a);
		const wageSpace = Math.max(0, wageBudget - payroll);
		const affordableFreeAgents = freeAgentRows.filter(
			(row) => row.demand <= minContract || row.demand <= wageSpace,
		);

		clubs.push({
			tid: t.tid,
			name: `${t.region} ${t.name}`,
			country: countryNameById.get(division.countryId)!,
			tier: division.tier,
			divisionId: division.divisionId,
			ovr: team.ovr(rosterPlus),
			rosterSize: roster.length,
			academySize: players.filter(
				(p) => p.tid === PLAYER.UNDRAFTED && p.academyTid === t.tid,
			).length,
			loanedIn: roster.filter((p) => (p as any).loan).length,
			injured: roster.filter((p) => p.injury.gamesRemaining > 0).length,
			payroll,
			wageBudget,
			wageSpace,
			rosterGapTo14: Math.max(0, 14 - roster.length),
			meanContract: mean(contractAmounts),
			topContract: contractAmounts[0] ?? 0,
			top3ContractShare:
				payroll > 0
					? contractAmounts
							.slice(0, 3)
							.reduce((sum, amount) => sum + amount, 0) / payroll
					: 0,
			numMinContracts: roster.filter(
				(p) => p.contract.amount <= g.get("minContract"),
			).length,
			numAffordableFreeAgents: affordableFreeAgents.length,
			bestAffordableFreeAgentOvr:
				affordableFreeAgents.length > 0
					? Math.max(...affordableFreeAgents.map((row) => row.ovr))
					: undefined,
			cash: (teamSeason?.cash ?? 0) / 1000,
			pop: teamSeason?.pop,
			hype: teamSeason?.hype,
			stadiumCapacity: teamSeason?.stadiumCapacity,
			avgAge: mean(roster.map((p) => season - p.born.year)),
			topBornLocs: Object.entries(
				Object.groupBy(roster, (p) => p.born.loc.split(", ").at(-1)!),
			)
				.map(([loc, group]) => [loc, group!.length] as const)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3),
			boardObjective: teamSeason?.boardObjective,
		});
	}

	const onClubs = players.filter((p) => p.tid >= 0);
	const academy = players.filter(
		(p) => p.tid === PLAYER.UNDRAFTED && p.academyTid !== undefined,
	);
	const ovrs = onClubs.map((p) => p.ratings.at(-1)!.ovr);
	const leagueInfo = {
		season,
		numClubPlayers: onClubs.length,
		numFreeAgents: freeAgents.length,
		freeAgentMeanOvr: mean(freeAgentRows.map((row) => row.ovr)),
		freeAgentsAtMin: freeAgents.filter(
			(p) => p.contract.amount <= g.get("minContract"),
		).length,
		freeAgentDemandPercentiles: [0.1, 0.25, 0.5, 0.75, 0.9].map((fraction) =>
			percentile(
				freeAgentRows.map((row) => row.demand),
				fraction,
			),
		),
		freeAgentDemandByOvr: [
			[-Infinity, 29],
			[30, 39],
			[40, 49],
			[50, 59],
			[60, Infinity],
		].map(([minOvr, maxOvr]) => {
			const rows = freeAgentRows.filter(
				(row) => row.ovr >= minOvr! && row.ovr <= maxOvr!,
			);
			return {
				ovr: `${minOvr === -Infinity ? "under 30" : maxOvr === Infinity ? "60+" : `${minOvr}-${maxOvr}`}`,
				count: rows.length,
				meanDemand: mean(rows.map((row) => row.demand)),
				medianDemand: percentile(
					rows.map((row) => row.demand),
					0.5,
				),
			};
		}),
		numAcademy: academy.length,
		numUndraftedWithoutAcademy: players.filter(
			(p) => p.tid === PLAYER.UNDRAFTED && p.academyTid === undefined,
		).length,
		academyAgeRange: [
			Math.min(...academy.map((p) => season - p.born.year)),
			Math.max(...academy.map((p) => season - p.born.year)),
		],
		numExpiredContracts: onClubs.filter((p) => p.contract.exp < season).length,
		numOver36: onClubs.filter((p) => season - p.born.year > 36).length,
		numClubPlayersWithAcademyTid: onClubs.filter(
			(p) => p.academyTid !== undefined,
		).length,
		meanOvr: mean(ovrs),
		numOvr60: ovrs.filter((ovr) => ovr >= 60).length,
		numOvr70: ovrs.filter((ovr) => ovr >= 70).length,
		meanContract: mean(onClubs.map((p) => p.contract.amount / 1000)),
		maxContract: Math.max(...onClubs.map((p) => p.contract.amount / 1000)),
		settings: {
			salaryCap: g.get("salaryCap") / 1000,
			minContract: g.get("minContract") / 1000,
			maxContract: g.get("maxContract") / 1000,
			minRosterSize: g.get("minRosterSize"),
			maxRosterSize: g.get("maxRosterSize"),
		},
		numTransferListed: players.filter((p) => (p as any).transferListed).length,
		numLoanListed: players.filter((p) => (p as any).loanListed).length,
	};

	return { season, clubs, league: leagueInfo };
};

type Snapshot = Awaited<ReturnType<typeof takeSnapshot>>;

// What happened in each completed season, from the league's history
const analyzeSeasons = async (snapshots: Snapshot[]) => {
	const { structure, divisionById, countryNameById } = getStructureInfo();
	const { confDivByDivisionId } = competition.getLegacyConfsDivs(structure);
	const divisionIdByDid = new Map(
		[...confDivByDivisionId].map(([divisionId, { did }]) => [did, divisionId]),
	);

	const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
	const events: EventBBGM[] = await idb.league.getAll("events");
	const players: Player[] = await idb.league.getAll("players");
	const teams = await idb.cache.teams.getAll();
	const clubName = (tid: number) => {
		const t = teams.find((t) => t.tid === tid);
		return t ? `${t.region} ${t.name}` : `tid ${tid}`;
	};

	const seasons = [];
	for (let i = 0; i < NUM_SEASONS; i++) {
		const season = STARTING_SEASON + i;
		const tables = await competition.getDivisionTables(season);
		const summary = (await competition.getWorldSeasonSummary(season))!;
		const rows = teamSeasons.filter((row) => row.season === season);
		const snapshot = snapshots.find((snapshot) => snapshot.season === season);

		const divisions = summary.flatMap((country) =>
			country.divisions.map((division) => {
				const table = tables[division.divisionId] ?? [];
				const numClubs = table.length;
				return {
					country: country.name,
					name: division.name,
					numClubs,
					gamesPlayed: [
						...new Set(table.map((row) => row.won + row.lost + row.tied)),
					],
					expectedGames: 2 * (numClubs - 1),
					champion: division.champion
						? `${clubName(division.champion.tid)} (${division.champion.points} pts)`
						: undefined,
					topPoints: table[0]?.points,
					bottomPoints: table.at(-1)?.points,
					promoted: division.promoted.map(
						(row) =>
							`${clubName(row.tid)}${row.viaPlayoff ? " (playoff)" : ""}`,
					),
					relegated: division.relegated.map(clubName),
					// Where the preseason's strongest squads finished
					strongestSquadsFinished: snapshot
						? snapshot.clubs
								.filter((club) => club.divisionId === division.divisionId)
								.sort((a, b) => b.ovr - a.ovr)
								.slice(0, 3)
								.map(
									(club) => table.findIndex((row) => row.tid === club.tid) + 1,
								)
						: [],
				};
			}),
		);

		const byTier = new Map<string, TeamSeason[]>();
		for (const row of rows) {
			const division = divisionById.get(row.divisionId!)!;
			const key = `${countryNameById.get(division.countryId)} ${division.tier}`;
			byTier.set(key, [...(byTier.get(key) ?? []), row]);
		}
		const sum = (record: Record<string, number>) =>
			Object.values(record).reduce((total, value) => total + value, 0);
		const finances = [...byTier].map(([key, group]) => ({
			tier: key,
			revenue: mean(group.map((row) => sum(row.revenues) / 1000)),
			expenses: mean(group.map((row) => sum(row.expenses) / 1000)),
			salaryExpense: mean(group.map((row) => row.expenses.salary / 1000)),
			endCash: mean(group.map((row) => row.cash / 1000)),
			minEndCash: Math.min(...group.map((row) => row.cash / 1000)),
			attendanceFill: mean(
				group.map((row) =>
					row.gpHome > 0 && row.stadiumCapacity > 0
						? row.att / row.gpHome / row.stadiumCapacity
						: Number.NaN,
				),
			),
			hype: mean(group.map((row) => row.hype)),
			pop: mean(group.map((row) => row.pop)),
		}));

		const boardObjectives: Record<string, { met: number; missed: number }> = {};
		for (const row of rows) {
			const objective = row.boardObjective;
			if (!objective) {
				continue;
			}
			const position =
				(tables[row.divisionId!] ?? []).findIndex((r) => r.tid === row.tid) + 1;
			const result = (boardObjectives[objective.kind] ??= {
				met: 0,
				missed: 0,
			});
			if (position > 0 && position <= objective.targetPosition) {
				result.met += 1;
			} else {
				result.missed += 1;
			}
		}

		// Players who walked away from relegated clubs at the end of this season,
		// by the tier they played in next season
		const clausePlayers = players.filter((p) => p.relegationClause === season);
		const nextTierByTid = new Map(
			teamSeasons
				.filter((row) => row.season === season + 1)
				.map((row) => [row.tid, divisionById.get(row.divisionId!)?.tier]),
		);
		const relegationClauses: Record<string, number> = {
			players: clausePlayers.length,
		};
		for (const p of clausePlayers) {
			const tid = p.stats.findLast((row) => row.season === season + 1)?.tid;
			const key =
				tid === undefined
					? "no club next season"
					: `tier ${nextTierByTid.get(tid) ?? "?"} next season`;
			relegationClauses[key] = (relegationClauses[key] ?? 0) + 1;
		}

		const eventCounts: Record<string, number> = {};
		for (const event of events) {
			if (event.season === season) {
				eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
			}
		}

		const awards = await idb.getCopy.awards({ season });
		const awardProblems: string[] = [];
		const divisionAwardCounts: Record<string, number> = {};
		for (const award of awards?.awards ?? []) {
			if (award.group?.type !== "div") {
				continue;
			}
			divisionAwardCounts[award.shortName] =
				(divisionAwardCounts[award.shortName] ?? 0) + 1;
			const divisionId = divisionIdByDid.get(award.group.did);
			const winners = (award.winner as unknown[])
				.flat()
				.filter((p): p is { pid: number; tid: number } => {
					return (p as { pid?: number }).pid !== undefined;
				});
			if (winners.length === 0) {
				awardProblems.push(
					`${award.shortName} did ${award.group.did} has no winner`,
				);
			}
			for (const p of winners) {
				const winnerDivisionId = rows.find(
					(row) => row.tid === p.tid,
				)?.divisionId;
				if (winnerDivisionId !== divisionId) {
					awardProblems.push(
						`${award.shortName} did ${award.group.did}: pid ${p.pid} played in Division ${winnerDivisionId}`,
					);
				}
			}
		}

		const withStats = players.filter((p) =>
			p.stats.some(
				(row) => row.season === season && !row.playoffs && row.gp > 0,
			),
		);
		const seasonOvrs = withStats
			.map((p) => p.ratings.find((row) => row.season === season)?.ovr)
			.filter((ovr) => ovr !== undefined);

		seasons.push({
			season,
			divisions,
			finances,
			boardObjectives,
			eventCounts,
			relegationClauses,
			divisionAwardCounts,
			awardProblems,
			otherAwards: (awards?.awards ?? [])
				.filter((award) => award.group?.type !== "div")
				.map((award) => award.shortName),
			players: {
				numWithStats: withStats.length,
				meanOvr: mean(seasonOvrs),
				meanAge: mean(withStats.map((p) => season - p.born.year)),
			},
			numTeamSeasons: rows.length,
			teamSeasonsWithoutDivision: rows.filter(
				(row) => row.divisionId === undefined,
			).length,
		});
	}

	// Clubs moving up and down over the whole run
	const tiersByTid = new Map<number, number[]>();
	for (const season of Array.from(
		{ length: NUM_SEASONS + 1 },
		(_, i) => STARTING_SEASON + i,
	)) {
		for (const row of teamSeasons.filter((row) => row.season === season)) {
			const tier = divisionById.get(row.divisionId!)?.tier ?? 0;
			tiersByTid.set(row.tid, [...(tiersByTid.get(row.tid) ?? []), tier]);
		}
	}
	let numYoYos = 0;
	let numNeverMoved = 0;
	for (const tiers of tiersByTid.values()) {
		if (tiers.every((tier) => tier === tiers[0])) {
			numNeverMoved += 1;
		}
		for (let i = 2; i < tiers.length; i++) {
			if (tiers[i] === tiers[i - 2] && tiers[i] !== tiers[i - 1]) {
				numYoYos += 1;
			}
		}
	}

	const championsByDivision: Record<string, string[]> = {};
	for (const season of seasons) {
		for (const division of season.divisions) {
			(championsByDivision[division.name] ??= []).push(
				division.champion ?? "none",
			);
		}
	}

	// How often promoted clubs go straight back down, by the tier they were
	// promoted into, and how often relegated clubs go straight back up
	const promotionSurvival: Record<
		string,
		{
			promoted: number;
			relegatedNextSeason: number;
			champions: number;
			championsRelegated: number;
			playoffWinners: number;
			playoffWinnersRelegated: number;
		}
	> = {};
	const relegationReturns = { relegated: 0, promotedNextSeason: 0 };
	const withoutPlayoff = (name: string) => name.replace(/ \(playoff\)$/, "");
	for (let i = 0; i < seasons.length - 1; i++) {
		const current = Map.groupBy(seasons[i]!.divisions, (d) => d.country);
		const next = Map.groupBy(seasons[i + 1]!.divisions, (d) => d.country);
		for (const [country, divisions] of current) {
			for (const [tierIndex, division] of divisions.entries()) {
				const upper = next.get(country)?.[tierIndex - 1];
				if (upper) {
					const row = (promotionSurvival[`into tier ${tierIndex}`] ??= {
						promoted: 0,
						relegatedNextSeason: 0,
						champions: 0,
						championsRelegated: 0,
						playoffWinners: 0,
						playoffWinnersRelegated: 0,
					});
					const champion = division.champion?.replace(/ \(\d+ pts\)$/, "");
					for (const name of division.promoted) {
						const down = upper.relegated.includes(withoutPlayoff(name));
						row.promoted += 1;
						row.relegatedNextSeason += down ? 1 : 0;
						if (name.endsWith("(playoff)")) {
							row.playoffWinners += 1;
							row.playoffWinnersRelegated += down ? 1 : 0;
						}
						if (withoutPlayoff(name) === champion) {
							row.champions += 1;
							row.championsRelegated += down ? 1 : 0;
						}
					}
				}

				const lower = next.get(country)?.[tierIndex + 1];
				if (lower) {
					const promotedNext = lower.promoted.map(withoutPlayoff);
					for (const name of division.relegated) {
						relegationReturns.relegated += 1;
						relegationReturns.promotedNextSeason += promotedNext.includes(name)
							? 1
							: 0;
					}
				}
			}
		}
	}

	return {
		seasons,
		clubMovement: {
			numClubs: tiersByTid.size,
			numNeverMoved,
			numYoYos,
			promotionSurvival,
			relegationReturns,
		},
		championsByDivision,
	};
};

const formatSummary = (
	snapshots: Snapshot[],
	analysis: Awaited<ReturnType<typeof analyzeSeasons>>,
) => {
	const lines: string[] = [`# World long run: ${COUNTRY_KEYS.join(", ")}`, ""];
	const table = (headers: string[], rows: (string | number)[][]) => {
		lines.push(
			`| ${headers.join(" | ")} |`,
			`| ${headers.map(() => "---").join(" | ")} |`,
		);
		for (const row of rows) {
			lines.push(`| ${row.join(" | ")} |`);
		}
		lines.push("");
	};

	lines.push("## Player pool at each regular season start", "");
	table(
		[
			"Season",
			"Club players",
			"FAs",
			"FA ovr",
			"FA at min",
			"FA demand p10/p25/p50/p75/p90",
			"Academy",
			"Undrafted no academy",
			"Academy ages",
			"Expired contracts",
			"Over 36",
			"Club players with academyTid",
			"Mean ovr",
			"60+",
			"70+",
			"Mean contract",
			"Max contract",
			"TL",
			"LL",
		],
		snapshots.map(({ league: l }) => [
			l.season,
			l.numClubPlayers,
			l.numFreeAgents,
			round(l.freeAgentMeanOvr),
			l.freeAgentsAtMin,
			l.freeAgentDemandPercentiles.map((value) => round(value)).join("/"),
			l.numAcademy,
			l.numUndraftedWithoutAcademy,
			l.academyAgeRange.join("-"),
			l.numExpiredContracts,
			l.numOver36,
			l.numClubPlayersWithAcademyTid,
			round(l.meanOvr),
			l.numOvr60,
			l.numOvr70,
			round(l.meanContract, 2),
			round(l.maxContract, 2),
			l.numTransferListed,
			l.numLoanListed,
		]),
	);

	lines.push("## Clubs by Country and tier at each regular season start", "");
	const tierKeys = [
		...new Set(
			snapshots[0]!.clubs.map((club) => `${club.country} ${club.tier}`),
		),
	];
	const tierRows = [];
	for (const snapshot of snapshots) {
		for (const key of tierKeys) {
			const clubs = snapshot.clubs.filter(
				(club) => `${club.country} ${club.tier}` === key,
			);
			tierRows.push([
				snapshot.season,
				key,
				`${round(Math.min(...clubs.map((c) => c.ovr)), 0)}/${round(mean(clubs.map((c) => c.ovr)), 0)}/${round(Math.max(...clubs.map((c) => c.ovr)), 0)}`,
				`${Math.min(...clubs.map((c) => c.rosterSize))}-${Math.max(...clubs.map((c) => c.rosterSize))}`,
				`${Math.min(...clubs.map((c) => c.academySize))}-${Math.max(...clubs.map((c) => c.academySize))}`,
				round(mean(clubs.map((c) => c.payroll))),
				round(mean(clubs.map((c) => c.wageBudget))),
				round(mean(clubs.map((c) => c.wageSpace))),
				clubs.filter((c) => c.payroll > c.wageBudget + 0.001).length,
				clubs.reduce((total, c) => total + c.rosterGapTo14, 0),
				round(mean(clubs.map((c) => c.top3ContractShare)), 2),
				round(mean(clubs.map((c) => c.numMinContracts)), 1),
				round(mean(clubs.map((c) => c.numAffordableFreeAgents)), 0),
				round(
					mean(
						clubs
							.map((c) => c.bestAffordableFreeAgentOvr)
							.filter((value) => value !== undefined),
					),
					0,
				),
				round(mean(clubs.map((c) => c.cash))),
				round(Math.min(...clubs.map((c) => c.cash))),
				round(Math.max(...clubs.map((c) => c.cash))),
				round(mean(clubs.map((c) => c.hype ?? Number.NaN)), 2),
				round(mean(clubs.map((c) => c.pop ?? Number.NaN)), 2),
				round(mean(clubs.map((c) => c.avgAge))),
				clubs.reduce((total, c) => total + c.loanedIn, 0),
			]);
		}
	}
	table(
		[
			"Season",
			"Tier",
			"Ovr min/mean/max",
			"Roster",
			"Academy",
			"Payroll",
			"Wage budget",
			"Wage space",
			"Over budget",
			"Gap to 14",
			"Top 3 share",
			"Min contracts",
			"Affordable FAs",
			"Best affordable ovr",
			"Cash mean",
			"Cash min",
			"Cash max",
			"Hype",
			"Pop",
			"Age",
			"Loaned in",
		],
		tierRows,
	);

	lines.push("## Free-agent demand by quality", "");
	table(
		["Season", "Ovr", "Players", "Mean demand", "Median demand"],
		snapshots.flatMap((snapshot) =>
			snapshot.league.freeAgentDemandByOvr.map((row) => [
				snapshot.season,
				row.ovr,
				row.count,
				round(row.meanDemand),
				round(row.medianDemand),
			]),
		),
	);

	lines.push("## Seasons", "");
	for (const season of analysis.seasons) {
		lines.push(`### ${season.season}`, "");
		table(
			[
				"Division",
				"Clubs",
				"Games",
				"Champion",
				"Pts top/bottom",
				"Promoted",
				"Relegated",
				"Strongest 3 squads finished",
			],
			season.divisions.map((division) => [
				division.name,
				division.numClubs,
				`${division.gamesPlayed.join(",")} (want ${division.expectedGames})`,
				division.champion ?? "-",
				`${division.topPoints}/${division.bottomPoints}`,
				division.promoted.join(", "),
				division.relegated.join(", "),
				division.strongestSquadsFinished.join(", "),
			]),
		);
		table(
			[
				"Tier",
				"Revenue",
				"Expenses",
				"Salaries",
				"End cash",
				"Min end cash",
				"Attendance fill",
				"Hype",
				"Pop",
			],
			season.finances.map((row) => [
				row.tier,
				round(row.revenue),
				round(row.expenses),
				round(row.salaryExpense),
				round(row.endCash),
				round(row.minEndCash),
				round(row.attendanceFill, 2),
				round(row.hype, 2),
				round(row.pop, 2),
			]),
		);
		lines.push(
			`Board objectives: ${JSON.stringify(season.boardObjectives)}`,
			"",
			`Events: ${JSON.stringify(season.eventCounts)}`,
			"",
			`Division awards: ${JSON.stringify(season.divisionAwardCounts)}; other awards: ${season.otherAwards.join(", ")}`,
			"",
			`Award problems: ${season.awardProblems.length > 0 ? season.awardProblems.join("; ") : "none"}`,
			"",
			`Players with stats: ${season.players.numWithStats}, mean ovr ${round(season.players.meanOvr)}, mean age ${round(season.players.meanAge)}; team seasons ${season.numTeamSeasons} (${season.teamSeasonsWithoutDivision} without a Division)`,
			"",
		);
	}

	lines.push("## Movement and champions", "");
	const movement = analysis.clubMovement;
	table(
		["Move", "Clubs", "Immediate reverse", "Rate"],
		[
			...Object.entries(movement.promotionSurvival).flatMap(([tier, row]) => [
				[
					`Promoted ${tier}`,
					row.promoted,
					row.relegatedNextSeason,
					`${round((100 * row.relegatedNextSeason) / row.promoted)}%`,
				],
				[
					`Champions ${tier}`,
					row.champions,
					row.championsRelegated,
					`${round((100 * row.championsRelegated) / row.champions)}%`,
				],
				[
					`Playoff winners ${tier}`,
					row.playoffWinners,
					row.playoffWinnersRelegated,
					`${round((100 * row.playoffWinnersRelegated) / row.playoffWinners)}%`,
				],
			]),
			[
				"Relegated clubs",
				movement.relegationReturns.relegated,
				movement.relegationReturns.promotedNextSeason,
				`${round(
					(100 * movement.relegationReturns.promotedNextSeason) /
						movement.relegationReturns.relegated,
				)}%`,
			],
		],
	);
	lines.push(
		`Never moved: ${movement.numNeverMoved}/${movement.numClubs}; yo-yos: ${movement.numYoYos}`,
		"",
	);
	for (const [division, champions] of Object.entries(
		analysis.championsByDivision,
	)) {
		lines.push(`- ${division}: ${champions.join("; ")}`);
	}
	lines.push("", `Errors: ${errors.length}`);

	return lines.join("\n");
};

describe.runIf(NUM_SEASONS > 0)("a realistic World over many seasons", () => {
	afterAll(async () => {
		(globalThis as any).process.off("unhandledRejection", onUnhandledRejection);
		if (g.get("lid") !== undefined) {
			await league.remove(g.get("lid"));
		}
		await idb.meta.close();
		await deleteDB("meta");
	});

	test(
		"plays and reports",
		async () => {
			(globalThis as any).process.on(
				"unhandledRejection",
				onUnhandledRejection,
			);
			const start = Date.now();
			const progress: string[] = [];
			const logProgress = async (text: string) => {
				progress.push(
					`${Math.round((Date.now() - start) / 1000)}s season ${g.get("season")} phase ${g.get("phase")}: ${text}`,
				);
				await writeReport("progress.txt", progress.join("\n"));
			};

			const info = CONTROL
				? {
						confs: unwrapGameAttribute(defaultGameAttributes, "confs"),
						divs: unwrapGameAttribute(defaultGameAttributes, "divs"),
						gameAttributes: {},
						teams: helpers.addPopRank(helpers.getTeamsDefault()),
					}
				: competition.getWorldNewLeagueInfo({
						countryKeys: COUNTRY_KEYS,
					});
			await league.createStream(createStreamFromLeagueObject({}), {
				confs: info.confs,
				divs: info.divs,
				fromFile: {
					gameAttributes: info.gameAttributes,
					hasRookieContracts: true,
					maxGid: undefined,
					startingSeason: undefined,
					teams: undefined,
					version: LEAGUE_DATABASE_VERSION,
				},
				getLeagueOptions: undefined,
				keptKeys: new Set(["gameAttributes"] as const),
				lid: 0,
				name: "Long run World",
				setLeagueCreationStatus: () => {},
				settings: {
					...(CONTROL ? getDefaultSettings() : getWorldDefaultSettings()),
					saveOldBoxScores: { pastSeasons: 0 },
				},
				shuffleRosters: false,
				startingSeasonFromInput: String(STARTING_SEASON),
				teamsFromInput: info.teams,
				tid: 0,
			});
			await logProgress("created");

			const snapshots: Snapshot[] = [];
			for (let i = 0; i < NUM_SEASONS; i++) {
				await playUntil(STARTING_SEASON + i, PHASE.REGULAR_SEASON);
				snapshots.push(await takeSnapshot());
				await writeReport("snapshots.json", snapshots);
				await discardBoxScores();
				await logProgress("regular season started");
			}
			// A comparable post-run snapshot: after the completed seasons' final
			// summer roster construction, at the next regular-season start.
			await playUntil(STARTING_SEASON + NUM_SEASONS, PHASE.REGULAR_SEASON);
			snapshots.push(await takeSnapshot());
			await writeReport("snapshots.json", snapshots);
			await discardBoxScores();
			await logProgress("done playing");
			if (CONTROL) {
				return;
			}

			await idb.cache.flush();
			const analysis = await analyzeSeasons(snapshots);
			await writeReport("report.json", {
				snapshots,
				analysis,
				errors: errors.map(String),
				revenueSettings: WORLD_REVENUE_SETTINGS,
				clauseSettings: RELEGATION_CLAUSE_SETTINGS,
			});
			await writeReport("summary.md", formatSummary(snapshots, analysis));

			// Storytelling: the stories the World's history produced
			// (STORY_TELLING_PLAN.md, Phase 0)
			const stories = await getStoryYieldReport();
			await writeReport("stories.json", stories);
			await writeReport("stories.md", formatStoryYield(stories.storyYield));
			await logProgress("report written");
		},
		6 * 60 * 60 * 1000,
	);
});
