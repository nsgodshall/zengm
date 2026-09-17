import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE, PLAYER } from "../common/constants.ts";
import { defaultGameAttributes } from "../common/defaultGameAttributes.ts";
import type {
	EventBBGM,
	GameAttributesLeague,
	HeadToHead,
	Player,
	TeamSeason,
} from "../common/types.ts";
import type { CompetitionStructure } from "../worker/core/competition/competitionStructure.ts";
import {
	getAcademyAges,
	getAcademyIntakeSize,
} from "../worker/core/competition/youthAcademy.ts";
import { competition, league, player, team } from "../worker/core/index.ts";
import { getWageBudgets } from "../worker/core/competition/wageBudgets.ts";
import {
	ACADEMY_LOAN_MIN_AGE,
	getLoanEndSeason,
	LOAN_MAX_AGE,
} from "../worker/core/competition/loans.ts";
import { getTvShare } from "../worker/core/competition/worldRevenue.ts";
import {
	getLegacyTimeline,
	getStartingLegacy,
	getStature,
} from "../worker/core/competition/clubStature.ts";
import {
	describePromotion,
	describeRelegation,
	describeTitle,
	getLongestTitleRun,
} from "../worker/core/competition/storyContext.ts";
import {
	getWorldAwards,
	getWorldAwardsBeforeSoccerStyle,
	YOUNG_PLAYER_MAX_AGE,
} from "../worker/core/competition/worldAwards.ts";
import {
	getTalentPoolSize,
	TALENT_POOL_MAX_AGE,
	TALENT_POOL_MIN_AGE,
} from "../worker/core/competition/talentPool.ts";
import {
	getStadiumCapacity,
	WORLD_MAX_ROSTER_SIZE,
	WORLD_MIN_ROSTER_SIZE,
} from "../worker/core/competition/worldSettings.ts";
import { RELEGATION_CLAUSE_SETTINGS } from "../worker/core/competition/relegationClauses.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import academyView from "../worker/views/academy.ts";
import historyAllView from "../worker/views/historyAll.ts";
import teamHistoryView from "../worker/views/teamHistory.ts";
import teamRecordsView from "../worker/views/teamRecords.ts";
import { getWorldDefaultSettings } from "../worker/views/newLeague.ts";

// International Soccer Zen GM mod (Epic 8): create a small World and auto play
// several full seasons through the real game code - schedule, games, season
// end, promotion/relegation, draft, free agency - then check what happened.

const STARTING_SEASON = 2016;
const NUM_SEASONS = 3;
const CLUBS_PER_DIVISION = 6;

// A double round robin of 6 clubs
const NUM_GAMES = 10;

// Northland: 1 up and 1 down. Southland: 1 up automatically plus 1 through a
// playoff of the next 4, and 2 down.
const structure: CompetitionStructure = {
	countries: [
		{ countryId: 0, name: "Northland" },
		{ countryId: 1, name: "Southland" },
	],
	competitionDivisions: [
		{ divisionId: 1, countryId: 0, tier: 1, name: "Northland 1" },
		{ divisionId: 2, countryId: 0, tier: 2, name: "Northland 2" },
		{ divisionId: 3, countryId: 1, tier: 1, name: "Southland 1" },
		{ divisionId: 4, countryId: 1, tier: 2, name: "Southland 2" },
	],
	promotionRelegationLinks: [
		{
			id: 1,
			countryId: 0,
			upperDivisionId: 1,
			lowerDivisionId: 2,
			numAutoPromoted: 1,
			numAutoRelegated: 1,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
		{
			id: 2,
			countryId: 1,
			upperDivisionId: 3,
			lowerDivisionId: 4,
			numAutoPromoted: 1,
			numAutoRelegated: 2,
			numPromotionPlayoffTeams: 4,
			numPromotionPlayoffSpots: 1,
		},
	],
};

const completedSeasons = Array.from(
	{ length: NUM_SEASONS },
	(_, i) => STARTING_SEASON + i,
);

const byTid = (a: number, b: number) => a - b;

// autoPlay doesn't await its whole chain (free agency deliberately breaks it
// up), so errors past that point only show up as unhandled rejections
const errors: unknown[] = [];
const onUnhandledRejection = (error: unknown) => {
	errors.push(error);
};

const waitFor = async (isDone: () => boolean, timeoutMs: number) => {
	const deadline = Date.now() + timeoutMs;
	while (!isDone()) {
		if (errors.length > 0) {
			throw errors[0];
		}
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out in season ${g.get("season")}, phase ${g.get("phase")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
};

const getSeasonRows = (season: number) =>
	idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: [
				"cid",
				"did",
				"divisionId",
				"won",
				"lost",
				"tied",
				"otl",
				"playoffRoundsWon",
			],
			season,
			showNoStats: true,
		},
		"noCopyCache",
	);

const getDivisionIdByTid = async (season: number) =>
	new Map(
		(await getSeasonRows(season)).map((t) => [
			t.tid,
			t.seasonAttrs.divisionId!,
		]),
	);

describe("a 2-country, 2-tier World over several seasons", () => {
	beforeAll(
		async () => {
			(globalThis as any).process.on(
				"unhandledRejection",
				onUnhandledRejection,
			);

			const teamsFromInput = helpers.addPopRank(
				helpers
					.getTeamsDefault()
					.slice(0, structure.competitionDivisions.length * CLUBS_PER_DIVISION)
					.map((t, i) => ({
						...t,
						divisionId:
							structure.competitionDivisions[
								Math.floor(i / CLUBS_PER_DIVISION)
							]!.divisionId,
					})),
			);

			const { confs, divs } = competition.getLegacyConfsDivs(structure);

			await league.createStream(createStreamFromLeagueObject({}), {
				confs,
				divs,
				fromFile: {
					gameAttributes: {
						countries: structure.countries,
						competitionDivisions: structure.competitionDivisions,
						promotionRelegationLinks: structure.promotionRelegationLinks,
					},
					hasRookieContracts: true,
					maxGid: undefined,
					startingSeason: undefined,
					teams: undefined,
					version: LEAGUE_DATABASE_VERSION,
				},
				getLeagueOptions: undefined,
				keptKeys: new Set(["gameAttributes"] as const),
				lid: 0,
				name: "World",
				setLeagueCreationStatus: () => {},
				settings: {
					...getWorldDefaultSettings(),
					numGames: NUM_GAMES,
				},
				shuffleRosters: false,
				startingSeasonFromInput: String(STARTING_SEASON),
				teamsFromInput,
				tid: 0,
			});

			const target = {
				season: STARTING_SEASON + NUM_SEASONS,
				phase: PHASE.PRESEASON,
			};
			local.autoPlayUntil = {
				...target,
				start: Date.now(),
			};
			league.autoPlay().catch(onUnhandledRejection);

			await waitFor(
				() =>
					local.autoPlayUntil === undefined &&
					g.get("season") === target.season &&
					g.get("phase") === target.phase &&
					!lock.get("newPhase"),
				9 * 60 * 1000,
			);

			await idb.cache.flush();
		},
		10 * 60 * 1000,
	);

	afterAll(async () => {
		(globalThis as any).process.off("unhandledRejection", onUnhandledRejection);

		if (g.get("lid") !== undefined) {
			await league.remove(g.get("lid"));
		}
		await idb.meta.close();
		await deleteDB("meta");
	});

	test("every Division keeps its clubs every season, with cid/did mirroring it", async () => {
		const { confDivByDivisionId } = competition.getLegacyConfsDivs(structure);

		for (const season of [...completedSeasons, STARTING_SEASON + NUM_SEASONS]) {
			const rows = await getSeasonRows(season);
			assert.strictEqual(
				rows.length,
				structure.competitionDivisions.length * CLUBS_PER_DIVISION,
			);

			for (const division of structure.competitionDivisions) {
				assert.strictEqual(
					rows.filter((t) => t.seasonAttrs.divisionId === division.divisionId)
						.length,
					CLUBS_PER_DIVISION,
					`${season} ${division.name}`,
				);
			}

			for (const t of rows) {
				const { cid, did } = confDivByDivisionId.get(
					t.seasonAttrs.divisionId!,
				)!;
				assert.strictEqual(t.seasonAttrs.cid, cid, `${season} tid ${t.tid}`);
				assert.strictEqual(t.seasonAttrs.did, did, `${season} tid ${t.tid}`);
			}
		}
	});

	test("every club plays a full season, only against its own Division", async () => {
		for (const season of completedSeasons) {
			const rows = await getSeasonRows(season);
			const divisionIdByTid = await getDivisionIdByTid(season);

			for (const t of rows) {
				const { won, lost, tied, otl } = t.seasonAttrs;
				assert.strictEqual(
					won + lost + tied + otl,
					NUM_GAMES,
					`${season} tid ${t.tid}`,
				);
			}

			const headToHead: HeadToHead | undefined = await idb.league.get(
				"headToHeads",
				season,
			);
			assert(headToHead, `No head-to-head records for ${season}`);
			for (const [tid, opponents] of Object.entries(headToHead.regularSeason)) {
				for (const otherTid of Object.keys(opponents)) {
					assert.strictEqual(
						divisionIdByTid.get(Number(tid)),
						divisionIdByTid.get(Number(otherTid)),
						`${season}: tid ${tid} played tid ${otherTid}`,
					);
				}
			}
		}
	});

	test("each Country's top-tier table winner is its champion", async () => {
		for (const season of completedSeasons) {
			const rows = await getSeasonRows(season);
			const tables = await competition.getDivisionTables(season);

			const champions = rows
				.filter((t) => t.seasonAttrs.playoffRoundsWon === 0)
				.map((t) => t.tid)
				.sort(byTid);

			assert.deepStrictEqual(
				champions,
				[tables[1]![0]!.tid, tables[3]![0]!.tid].sort(byTid),
				`${season}`,
			);
		}
	});

	test("clubs move between seasons exactly as the tables and promotion playoff say", async () => {
		for (const season of completedSeasons) {
			const tables = await competition.getDivisionTables(season);
			const before = await getDivisionIdByTid(season);
			const after = await getDivisionIdByTid(season + 1);

			const moves = [...before]
				.filter(([tid, divisionId]) => after.get(tid) !== divisionId)
				.map(([tid, divisionId]) => ({
					tid,
					from: divisionId,
					to: after.get(tid),
				}));
			const moved = (from: number, to: number) =>
				moves
					.filter((move) => move.from === from && move.to === to)
					.map((move) => move.tid)
					.sort(byTid);

			// Northland: top of tier 2 up, bottom of tier 1 down
			assert.deepStrictEqual(moved(2, 1), [tables[2]![0]!.tid], `${season}`);
			assert.deepStrictEqual(
				moved(1, 2),
				[tables[1]!.at(-1)!.tid],
				`${season}`,
			);

			// Southland: top of tier 2 up, plus the winner of a playoff among 2nd-5th,
			// and the bottom 2 of tier 1 down
			const southlandUp = moved(4, 3);
			const autoPromotedTid = tables[4]![0]!.tid;
			assert.strictEqual(southlandUp.length, 2, `${season}`);
			assert(southlandUp.includes(autoPromotedTid), `${season}`);
			const playoffWinnerTid = southlandUp.find(
				(tid) => tid !== autoPromotedTid,
			);
			assert(
				tables[4]!.slice(1, 5).some((row) => row.tid === playoffWinnerTid),
				`${season}: playoff winner ${playoffWinnerTid} wasn't 2nd-5th`,
			);
			assert.deepStrictEqual(
				moved(3, 4),
				tables[3]!
					.slice(-2)
					.map((row) => row.tid)
					.sort(byTid),
				`${season}`,
			);

			assert.strictEqual(moves.length, 6, `${season}`);
		}
	});

	test("promotions and relegations are in the news", async () => {
		const events: EventBBGM[] = await idb.league.getAll("events");
		assert(
			!events.some((event) =>
				event.text?.includes("eliminated from playoff contention"),
			),
			"World clubs received league playoff elimination news",
		);

		for (const season of completedSeasons) {
			for (const type of ["promotion", "relegation"] as const) {
				assert.strictEqual(
					events.filter(
						(event) => event.season === season && event.type === type,
					).length,
					3,
					`${season} ${type}`,
				);
			}
		}
	});

	test("title, promotion, and relegation news says what it means in each club's history", async () => {
		const events: EventBBGM[] = await idb.league.getAll("events");
		const teams = await idb.cache.teams.getAll();
		const divisionsById = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division,
			]),
		);

		let numWithContext = 0;
		for (const season of completedSeasons) {
			for (const t of teams) {
				const entry = t.worldHistory!.find((entry) => entry.season === season)!;
				const division = divisionsById.get(entry.divisionId)!;
				const clubEvents = events.filter(
					(event) => event.season === season && event.tids?.[0] === t.tid,
				);

				const expected = [];
				if (entry.champion) {
					const countryHistories = teams
						.filter(
							(other) =>
								divisionsById.get(other.divisionId!)!.countryId ===
								division.countryId,
						)
						.map((other) =>
							other.worldHistory!.filter((e) => e.season < season),
						);
					expected.push({
						type: "playoffs",
						text: "finished top of",
						context: describeTitle({
							history: t.worldHistory!,
							season,
							tier: entry.tier,
							countryRecordRun: getLongestTitleRun(
								countryHistories,
								entry.tier,
							),
						}),
					});
				}
				if (entry.moved) {
					const other = structure.competitionDivisions.find(
						(d) =>
							d.countryId === division.countryId &&
							d.tier === division.tier + (entry.moved === "promoted" ? -1 : 1),
					)!;
					expected.push({
						type: entry.moved === "promoted" ? "promotion" : "relegation",
						text: "",
						context:
							entry.moved === "promoted"
								? describePromotion({
										history: t.worldHistory!,
										season,
										toTier: other.tier,
										toName: other.name,
									})
								: describeRelegation({
										history: t.worldHistory!,
										season,
										fromTier: division.tier,
										fromName: division.name,
									}),
					});
				}

				for (const { type, text, context } of expected) {
					const event = clubEvents.find(
						(event) => event.type === type && event.text!.includes(text),
					);
					assert(event, `${season} ${t.tid} ${type}`);
					for (const sentence of context.sentences) {
						assert(event.text!.includes(sentence), event.text);
					}
					numWithContext += context.sentences.length;
				}
			}
		}

		// Three seasons are enough for clubs to repeat as champions or go straight
		// back up or down
		assert(numWithContext > 0);
	});

	test("AI clubs buy players for fees, only while a transfer window can be open", async () => {
		const players: Player[] = await idb.league.getAll("players");
		const transfers = players.flatMap((p) =>
			(p.transactions ?? []).flatMap((row) =>
				row.type === "transfer" ? [row] : [],
			),
		);

		// AI runs every club during auto play, and the summer window covers the
		// whole offseason, so there's plenty of chance for transfers
		assert(transfers.length > 0, "No transfers happened");

		// The winter window is part of the regular season, and the summer window
		// runs from the end of the season through the preseason
		const phasesWithAWindow = new Set<number>([
			PHASE.PRESEASON,
			PHASE.REGULAR_SEASON,
			PHASE.DRAFT_LOTTERY,
			PHASE.DRAFT,
			PHASE.AFTER_DRAFT,
			PHASE.RESIGN_PLAYERS,
			PHASE.FREE_AGENCY,
		]);
		for (const transfer of transfers) {
			assert(
				phasesWithAWindow.has(transfer.phase),
				`Transfer in phase ${transfer.phase}`,
			);
			assert.notStrictEqual(transfer.tid, transfer.fromTid);
			assert(transfer.fee >= 0);
		}

		// Signings from the international talent pool are in the transfer news too
		const talentPoolSignings = players.flatMap((p) =>
			(p.transactions ?? []).flatMap((row) =>
				row.type === "talentPool" ? [row] : [],
			),
		);
		for (const signing of talentPoolSignings) {
			assert(
				phasesWithAWindow.has(signing.phase),
				`Talent pool signing in phase ${signing.phase}`,
			);
			assert(signing.fee >= 0);
		}

		const events: EventBBGM[] = await idb.league.getAll("events");
		assert.strictEqual(
			events.filter((event) => event.type === "transfer").length,
			transfers.length + talentPoolSignings.length,
		);
	});

	test("record fees are kept for the World, each Country, and each club, and an older World finds them when it loads", async () => {
		const players: Player[] = await idb.league.getAll("players");
		const teams = await idb.cache.teams.getAll();
		const countryIdByTid = new Map(
			teams.map((t) => [
				t.tid,
				structure.competitionDivisions.find(
					(division) => division.divisionId === t.divisionId,
				)!.countryId,
			]),
		);
		const fees = players.flatMap((p) =>
			(p.transactions ?? []).flatMap((transaction) =>
				transaction.type === "transfer" && transaction.fee > 0
					? [{ fee: transaction.fee, buyerTid: transaction.tid }]
					: [],
			),
		);
		assert(fees.length > 0);
		const maxFee = (rows: typeof fees) =>
			rows.length === 0 ? undefined : Math.max(...rows.map((row) => row.fee));

		const check = async () => {
			const records = g.get("worldTransferRecords")!;
			assert.strictEqual(records.world?.fee, maxFee(fees));
			for (const country of structure.countries) {
				assert.strictEqual(
					records.byCountryId[country.countryId]?.fee,
					maxFee(
						fees.filter(
							(row) => countryIdByTid.get(row.buyerTid) === country.countryId,
						),
					),
				);
			}
			for (const t of await idb.cache.teams.getAll()) {
				assert.strictEqual(
					t.worldRecordSigning?.fee,
					maxFee(fees.filter((row) => row.buyerTid === t.tid)),
				);
			}
		};
		await check();

		for (const t of await idb.cache.teams.getAll()) {
			delete t.worldRecordSigning;
			await idb.cache.teams.put(t);
		}
		g.setWithoutSavingToDB("worldTransferRecords", undefined);
		g.setWithoutSavingToDB("worldTransferRecordsFilled", undefined);
		await competition.ensureCompetitionStructure();
		assert.strictEqual(g.get("worldTransferRecordsFilled"), true);
		await check();
	});

	test("a player page's transfer info knows whose player he is and what he'd cost", async () => {
		const userTid = g.get("userTid");

		const userPlayer = (
			await idb.cache.players.indexGetAll("playersByTid", userTid)
		)[0]!;
		const userInfo = (await competition.getPlayerTransferInfo(userPlayer))!;
		assert.strictEqual(userInfo.userClub, true);
		assert.strictEqual(userInfo.inAcademy, false);
		assert.strictEqual(userInfo.clubTid, userTid);

		const otherProspect = (await competition.getAcademyPlayers()).find(
			(p) => p.academyTid !== userTid,
		)!;
		const prospectInfo =
			(await competition.getPlayerTransferInfo(otherProspect))!;
		assert.strictEqual(prospectInfo.userClub, false);
		assert.strictEqual(prospectInfo.inAcademy, true);
		assert.strictEqual(prospectInfo.clubTid, otherProspect.academyTid);
		assert(prospectInfo.fee > 0);

		// Free agents aren't at a club
		const freeAgent = (
			await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
		)[0];
		if (freeAgent) {
			assert.strictEqual(
				await competition.getPlayerTransferInfo(freeAgent),
				undefined,
			);
		}
	});

	test("a World has no minimum payroll fine or luxury tax, even one made before that was decided", async () => {
		assert.strictEqual(g.get("luxuryTax"), 0);
		assert.strictEqual(g.get("minPayroll"), 0);

		const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
		for (const teamSeason of teamSeasons) {
			assert.strictEqual(teamSeason.expenses.luxuryTax ?? 0, 0);
			assert.strictEqual(teamSeason.expenses.minTax ?? 0, 0);
		}

		// An older World still has ZenGM's payroll rules until it's loaded
		g.setWithoutSavingToDB("luxuryTax", 1.5);
		g.setWithoutSavingToDB("minPayroll", 95000);
		delete (g as unknown as { worldPayrollRulesOff?: true })
			.worldPayrollRulesOff;
		await competition.ensureCompetitionStructure();
		assert.strictEqual(g.get("luxuryTax"), 0);
		assert.strictEqual(g.get("minPayroll"), 0);
		assert.strictEqual(g.get("worldPayrollRulesOff"), true);
	});

	test("a club's league history follows its Divisions and table positions", async () => {
		const tierByDivisionId = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.tier,
			]),
		);

		for (const t of await idb.cache.teams.getAll()) {
			const leagueHistory = (await competition.getLeagueHistory(t.tid))!;

			// It's the preseason, so this season hasn't had a game yet
			assert.deepStrictEqual(
				leagueHistory.seasons.map((row) => row.season),
				completedSeasons,
			);
			assert.strictEqual(leagueHistory.numPlaces, 2 * CLUBS_PER_DIVISION);

			for (const row of leagueHistory.seasons) {
				const table = (await competition.getDivisionTables(row.season))[
					row.divisionId
				]!;
				assert.strictEqual(table[row.position - 1]!.tid, t.tid);
				assert.strictEqual(row.tier, tierByDivisionId.get(row.divisionId));
				assert.strictEqual(
					row.pyramidPosition,
					(row.tier - 1) * CLUBS_PER_DIVISION + row.position,
				);
				assert.strictEqual(row.inProgress, false);
			}

			const info = (await competition.getClubDivisionInfo(
				t.tid,
				g.get("season"),
			))!;
			assert.strictEqual(info.divisionId, t.divisionId);
			assert.strictEqual(info.tier, tierByDivisionId.get(t.divisionId!));
			assert.strictEqual(info.numClubs, CLUBS_PER_DIVISION);
		}
	});

	test("the season summary names each Division's champion and who went up and down", async () => {
		for (const season of completedSeasons) {
			const tables = await competition.getDivisionTables(season);
			const before = await getDivisionIdByTid(season);
			const after = await getDivisionIdByTid(season + 1);
			const tierByDivisionId = new Map(
				structure.competitionDivisions.map((division) => [
					division.divisionId,
					division.tier,
				]),
			);

			const summary = (await competition.getWorldSeasonSummary(season))!;
			assert.deepStrictEqual(
				summary.map((country) => country.name),
				["Northland", "Southland"],
			);

			let numPlayoffPromotions = 0;
			for (const division of summary.flatMap((country) => country.divisions)) {
				assert.strictEqual(
					division.champion?.tid,
					tables[division.divisionId]![0]!.tid,
				);

				const movedTids = (up: boolean) =>
					[...before]
						.filter(([tid, divisionId]) => {
							const toTier = tierByDivisionId.get(after.get(tid)!)!;
							return (
								divisionId === division.divisionId &&
								(up ? toTier < division.tier : toTier > division.tier)
							);
						})
						.map(([tid]) => tid)
						.sort(byTid);

				assert.deepStrictEqual(
					division.promoted.map((row) => row.tid).sort(byTid),
					movedTids(true),
					`${season} ${division.name}`,
				);
				assert.deepStrictEqual(
					[...division.relegated].sort(byTid),
					movedTids(false),
					`${season} ${division.name}`,
				);
				numPlayoffPromotions += division.promoted.filter(
					(row) => row.viaPlayoff,
				).length;
			}

			// Only Southland has a promotion playoff
			assert.strictEqual(numPlayoffPromotions, 1, `${season}`);
		}
	});

	test("every club's finished seasons are recorded on its team seasons and in its history", async () => {
		const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
		const teams = await idb.cache.teams.getAll();
		const tierByDivisionId = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.tier,
			]),
		);

		for (const season of completedSeasons) {
			const tables = await competition.getDivisionTables(season);
			const after = await getDivisionIdByTid(season + 1);
			const summary = (await competition.getWorldSeasonSummary(season))!;
			const championTids = new Set(
				summary.flatMap((country) =>
					country.divisions.map((division) => division.champion!.tid),
				),
			);

			for (const [divisionId, table] of Object.entries(tables)) {
				for (const [i, row] of table.entries()) {
					const teamSeason = teamSeasons.find(
						(ts) => ts.season === season && ts.tid === row.tid,
					)!;
					const record = teamSeason.worldSeason!;
					const label = `${season} tid ${row.tid}`;
					assert(record, label);
					assert.strictEqual(record.divisionId, Number(divisionId), label);
					assert.strictEqual(record.position, i + 1, label);
					assert.strictEqual(record.points, row.points, label);
					assert.strictEqual(
						record.champion,
						championTids.has(row.tid) || undefined,
					);

					const tier = tierByDivisionId.get(record.divisionId)!;
					const nextTier = tierByDivisionId.get(after.get(row.tid)!)!;
					assert.strictEqual(
						record.moved,
						nextTier < tier
							? "promoted"
							: nextTier > tier
								? "relegated"
								: undefined,
						label,
					);
					assert.strictEqual(
						record.pyramidPosition,
						(tier - 1) * CLUBS_PER_DIVISION + i + 1,
						label,
					);
					assert(record.boardObjective, label);
					assert.strictEqual(
						record.boardObjective.met,
						i + 1 <= record.boardObjective.targetPosition,
					);

					// Runs and leaders come from the games actually played
					const runs = record.runs!;
					assert(runs, label);
					assert(runs.longestWinning <= row.won, label);
					assert(runs.longestLosing <= row.lost, label);
					assert(runs.longestUnbeaten >= runs.longestWinning, label);
					assert(runs.longestWinless >= runs.longestLosing, label);
					assert.strictEqual(runs.biggestWin !== undefined, row.won > 0, label);
					assert(record.mostGames && record.mostGames.gp <= NUM_GAMES, label);
					assert(record.topScorer && record.topScorer.value > 0, label);

					const t = teams.find((t) => t.tid === row.tid)!;
					const entry = t.worldHistory!.find(
						(entry) => entry.season === season,
					);
					assert.deepStrictEqual(
						entry,
						{
							season,
							divisionId: record.divisionId,
							tier: record.tier,
							position: record.position,
							numClubs: record.numClubs,
							pyramidPosition: record.pyramidPosition,
							points: record.points,
							...(record.champion ? { champion: true } : {}),
							...(record.moved ? { moved: record.moved } : {}),
							...(record.promotionPlayoff
								? { promotionPlayoff: record.promotionPlayoff }
								: {}),
							stature: record.stature,
						},
						label,
					);
				}
			}

			// Southland's promotion playoff has one winner and some losers
			const playoffRecords = teamSeasons
				.filter(
					(ts) => ts.season === season && ts.worldSeason?.promotionPlayoff,
				)
				.map((ts) => ts.worldSeason!);
			assert.strictEqual(
				playoffRecords.filter((record) => record.promotionPlayoff === "won")
					.length,
				1,
			);
			assert(
				playoffRecords.some((record) => record.promotionPlayoff === "lost"),
			);
		}

		for (const t of teams) {
			assert.deepStrictEqual(
				t.worldHistory!.map((entry) => entry.season),
				completedSeasons,
			);
		}
	});

	test("every club's stature builds from its starting tier, its finishes, and its market", async () => {
		const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
		for (const t of await idb.cache.teams.getAll()) {
			const startingTier = t.worldHistory![0]!.tier;
			assert.deepStrictEqual(t.worldStatureSeed, {
				legacy: getStartingLegacy(startingTier),
				season: STARTING_SEASON,
			});
			const timeline = getLegacyTimeline(t.worldStatureSeed!, t.worldHistory!);
			for (const entry of t.worldHistory!) {
				const pop = teamSeasons.find(
					(row) => row.tid === t.tid && row.season === entry.season,
				)!.pop;
				assert.strictEqual(
					entry.stature,
					getStature({
						legacy: timeline.find((row) => row.season === entry.season)!.legacy,
						pop,
					}),
				);
			}

			const info = (await competition.getClubInfo(t.tid, g.get("season")))!;
			assert(info.stature !== undefined && info.stature >= 0);
			assert(info.statureLabel);
		}
	});

	test("a World made before season records gets them when it loads, and its league history reads them", async () => {
		const before = (await idb.cache.teams.getAll()).map((t) => ({
			tid: t.tid,
			worldHistory: t.worldHistory,
		}));
		for (const t of await idb.cache.teams.getAll()) {
			delete t.worldHistory;
			await idb.cache.teams.put(t);
		}
		g.setWithoutSavingToDB("worldSeasonRecordsFilled", undefined);

		await competition.ensureCompetitionStructure();

		assert.strictEqual(g.get("worldSeasonRecordsFilled"), true);
		for (const { tid, worldHistory } of before) {
			assert.deepStrictEqual(
				(await idb.cache.teams.get(tid))!.worldHistory,
				worldHistory,
			);
		}

		// League history comes from the club's saved history once it has it
		const t = (await idb.cache.teams.getAll())[0]!;
		const original = t.worldHistory!;
		t.worldHistory = original.map((entry) =>
			entry.season === STARTING_SEASON
				? { ...entry, position: 99, pyramidPosition: 99 }
				: entry,
		);
		await idb.cache.teams.put(t);
		const leagueHistory = (await competition.getLeagueHistory(t.tid))!;
		assert.strictEqual(leagueHistory.seasons[0]!.position, 99);
		assert.strictEqual(leagueHistory.seasons[0]!.pyramidPosition, 99);
		t.worldHistory = original;
		await idb.cache.teams.put(t);
	});

	test("a club's history page, League History, and Team Records show its honours", async () => {
		const teams = await idb.cache.teams.getAll();
		const championsByTier = new Map<number, number>();
		for (const t of teams) {
			const history = t.worldHistory!;
			const data = await teamHistoryView(
				{ tid: t.tid, abbrev: t.abbrev, show: "10" },
				["firstRun"],
				{},
			);
			assert(data && "worldHonours" in data && data.worldHonours);
			const honours = data.worldHonours;

			assert.strictEqual(honours.numSeasons, completedSeasons.length);
			assert.deepStrictEqual(
				honours.titles.flatMap((row) => row.seasons).sort(),
				history
					.filter((e) => e.champion)
					.map((e) => e.season)
					.sort(),
			);
			for (const row of honours.titles) {
				championsByTier.set(
					row.tier,
					(championsByTier.get(row.tier) ?? 0) + row.seasons.length,
				);
			}
			assert.deepStrictEqual(
				honours.promotions.map((row) => row.season),
				history.filter((e) => e.moved === "promoted").map((e) => e.season),
			);
			assert.deepStrictEqual(
				honours.relegations,
				history.filter((e) => e.moved === "relegated").map((e) => e.season),
			);
			assert.strictEqual(
				honours.seasonsByTier.reduce((sum, row) => sum + row.seasons, 0),
				completedSeasons.length,
			);
			assert(honours.seasonsByTier.every((row) => row.divisionName !== ""));
			assert.deepStrictEqual(
				honours.seasons.map((row) => row.season),
				completedSeasons,
			);
		}
		// Every Division has a champion every season
		for (const tier of [1, 2]) {
			assert.strictEqual(
				championsByTier.get(tier),
				structure.countries.length * completedSeasons.length,
			);
		}

		const leagueHistory = await historyAllView({}, ["firstRun"]);
		assert(leagueHistory && "worldRollOfHonour" in leagueHistory);
		const rollOfHonour = leagueHistory.worldRollOfHonour!;
		assert.deepStrictEqual(
			rollOfHonour.map((country) => country.name),
			["Northland", "Southland"],
		);
		for (const country of rollOfHonour) {
			assert.deepStrictEqual(
				country.seasons.map((row) => row.season),
				completedSeasons.toReversed(),
			);
			for (const row of country.seasons) {
				assert(row.champions.every((champion) => champion !== undefined));
				assert(row.runnerUp);
				const link = structure.promotionRelegationLinks.find(
					(link) => link.countryId === country.countryId,
				)!;
				assert.strictEqual(row.relegatedFromTop.length, link.numAutoRelegated);
				assert.strictEqual(row.promotedToTop.length, link.numAutoRelegated);
			}
		}

		const records = await teamRecordsView(
			{ byType: "by_team", filter: "all" },
			["firstRun"],
			{},
		);
		assert(records && "world" in records && records.world);
		for (const row of records.teams.filter((row) => row.root)) {
			const t = teams.find((t) => t.tid === row.tid)!;
			assert.strictEqual(
				row.world?.promotions,
				t.worldHistory!.filter((e) => e.moved === "promoted").length,
			);
			assert.strictEqual(
				row.world?.titles,
				t.worldHistory!.filter((e) => e.champion && e.tier === 1).length,
			);
		}
	});

	test("each Division has its own MVP, top scorer, young player, and All-Division team, and there are no other awards, even in a World made before that was decided", async () => {
		assert.deepStrictEqual(g.get("awards"), getWorldAwards());

		const { confDivByDivisionId } = competition.getLegacyConfsDivs(structure);
		for (const season of completedSeasons) {
			const awards = (await idb.getCopy.awards({ season }))!;
			const divisionIdByTid = await getDivisionIdByTid(season);
			for (const division of structure.competitionDivisions) {
				const did = confDivByDivisionId.get(division.divisionId)!.did;
				for (const shortName of ["MVP", "TS", "YPS", "ALD"]) {
					const award = awards.awards.find(
						(award) =>
							award.shortName === shortName &&
							award.group?.type === "div" &&
							award.group.did === did,
					);
					assert(award, `${season} ${division.name} ${shortName}`);

					const winners = (award.winner as unknown[])
						.flat()
						.filter(
							(p): p is { pid: number; tid: number } =>
								(p as { pid?: number }).pid !== undefined,
						);
					assert(winners.length > 0, `${season} ${division.name} ${shortName}`);
					for (const p of winners) {
						assert.strictEqual(
							divisionIdByTid.get(p.tid),
							division.divisionId,
							`${season} ${division.name} ${shortName}`,
						);
					}

					if (shortName === "YPS") {
						const p = (await idb.getCopy.players({ pid: winners[0]!.pid }))!;
						assert(
							season - p.born.year <= YOUNG_PLAYER_MAX_AGE,
							`${season} ${division.name}'s young player is ${season - p.born.year}`,
						);
					}
				}
			}
		}

		// A World made earlier has ZenGM's default awards, or its earlier World
		// awards, until it's loaded
		for (const oldAwards of [
			defaultGameAttributes.awards,
			getWorldAwardsBeforeSoccerStyle(),
		]) {
			g.setWithoutSavingToDB("awards", oldAwards);
			delete (g as unknown as { worldSoccerAwards?: true }).worldSoccerAwards;
			await competition.ensureCompetitionStructure();
			assert.deepStrictEqual(g.get("awards"), getWorldAwards());
			assert.strictEqual(g.get("worldSoccerAwards"), true);
		}
	});

	test("a World made before crests, bigger rosters, and stadiums by market gets them when it loads", async () => {
		const t = (await idb.cache.teams.getAll())[0]!;
		t.imgURL = "";
		t.stadiumCapacity = g.get("defaultStadiumCapacity");
		await idb.cache.teams.put(t);
		g.setWithoutSavingToDB(
			"maxRosterSize",
			defaultGameAttributes.maxRosterSize,
		);
		g.setWithoutSavingToDB(
			"minRosterSize",
			defaultGameAttributes.minRosterSize,
		);
		delete (g as unknown as { worldContentFilled?: true }).worldContentFilled;
		g.setWithoutSavingToDB("worldMinimumRosterSet", undefined);

		await competition.ensureCompetitionStructure();

		const filled = (await idb.cache.teams.get(t.tid))!;
		assert(filled.imgURL?.startsWith("data:image/svg+xml"), filled.imgURL);
		const teamSeason = (await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[g.get("season"), t.tid],
		))!;
		assert.strictEqual(
			filled.stadiumCapacity,
			getStadiumCapacity(teamSeason.pop),
		);
		assert.strictEqual(teamSeason.imgURL, filled.imgURL);
		assert.strictEqual(g.get("maxRosterSize"), WORLD_MAX_ROSTER_SIZE);
		assert.strictEqual(g.get("minRosterSize"), WORLD_MIN_ROSTER_SIZE);
		assert.strictEqual(g.get("worldMinimumRosterSet"), true);
		assert.strictEqual(g.get("worldContentFilled"), true);
	});

	test("every club gets a board objective each season, and is judged on it and on promotion and relegation", async () => {
		const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
		const tierByDivisionId = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.tier,
			]),
		);

		for (const season of completedSeasons) {
			const rows = teamSeasons.filter((row) => row.season === season);
			assert.strictEqual(rows.length, 4 * CLUBS_PER_DIVISION);
			for (const row of rows) {
				const objective = row.boardObjective;
				assert(objective, `${season} tid ${row.tid} has no objective`);
				assert(
					objective.targetPosition >= 1 &&
						objective.targetPosition <= CLUBS_PER_DIVISION,
				);
				const tier = tierByDivisionId.get(row.divisionId!);
				if (tier === 1) {
					assert(!["promotion", "promotionPlayoff"].includes(objective.kind));
				} else {
					assert.notStrictEqual(objective.kind, "avoidRelegation");
				}
			}
		}

		// The last season is the one whose moves are still on the teams
		const season = completedSeasons.at(-1)!;
		const before = await getDivisionIdByTid(season);
		const after = await getDivisionIdByTid(season + 1);
		for (const [tid, divisionId] of before) {
			const result = (await competition.evaluateBoardObjective(tid, season))!;
			const info = (await competition.getClubDivisionInfo(tid, season))!;
			const objective = teamSeasons.find(
				(row) => row.season === season && row.tid === tid,
			)!.boardObjective!;

			const tier = tierByDivisionId.get(divisionId)!;
			const nextTier = tierByDivisionId.get(after.get(tid)!)!;
			let expectedPlayoffs = 0;
			if (nextTier < tier || (tier === 1 && info.position === 1)) {
				expectedPlayoffs = 0.2;
			} else if (nextTier > tier) {
				expectedPlayoffs = -0.2;
			}
			assert.strictEqual(result.playoffs, expectedPlayoffs, `tid ${tid}`);
			assert.strictEqual(
				result.wins > 0,
				info.position <= objective.targetPosition,
				`tid ${tid}`,
			);
			assert(result.text.includes(info.divisionName));
		}
	});

	test("a relegated club's best-paid players walk away as free agents through relegation clauses", async () => {
		const players: Player[] = await idb.league.getAll("players");
		const releasedPlayers = await idb.league.getAll("releasedPlayers");
		const tierByDivisionId = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.tier,
			]),
		);

		for (const season of completedSeasons) {
			const before = await getDivisionIdByTid(season);
			const after = await getDivisionIdByTid(season + 1);
			const relegatedTids = new Set(
				[...before]
					.filter(
						([tid, divisionId]) =>
							tierByDivisionId.get(after.get(tid)!)! >
							tierByDivisionId.get(divisionId)!,
					)
					.map(([tid]) => tid),
			);
			assert.strictEqual(relegatedTids.size, 3, `${season}`);

			const clausePlayers = players.filter(
				(p) => p.relegationClause === season,
			);
			assert(clausePlayers.length > 0, `${season}: no relegation clauses`);
			assert(
				clausePlayers.length <=
					relegatedTids.size * RELEGATION_CLAUSE_SETTINGS.numPlayers,
				`${season}`,
			);

			// Each was at a relegated club that season, which isn't paying the rest
			// of his contract
			for (const p of clausePlayers) {
				const clubTid = p.stats.findLast(
					(row) => row.season === season && relegatedTids.has(row.tid),
				)?.tid;
				assert(clubTid !== undefined, `${season}: pid ${p.pid}`);
				assert(
					!releasedPlayers.some(
						(row) => row.pid === p.pid && row.tid === clubTid,
					),
					`${season}: pid ${p.pid}`,
				);
			}
		}
	});

	test("higher tiers get more national TV money, and champions and promoted clubs get prize money", async () => {
		const teamSeasons: TeamSeason[] = await idb.league.getAll("teamSeasons");
		const userTids = g.get("userTids");
		const tierByDivisionId = new Map(
			structure.competitionDivisions.map((division) => [
				division.divisionId,
				division.tier,
			]),
		);

		for (const season of completedSeasons) {
			// The user's revenue is adjusted for difficulty
			const rows = teamSeasons.filter(
				(row) => row.season === season && !userTids.includes(row.tid),
			);
			const tvByTier = (tier: number) =>
				rows
					.filter((row) => tierByDivisionId.get(row.divisionId!) === tier)
					.map((row) => row.revenues.nationalTv);

			// Every club plays the same number of regular-season games, so each
			// tier's clubs get the same TV money.
			const top = tvByTier(1);
			const second = tvByTier(2);
			assert(Math.max(...top) - Math.min(...top) < 1, `${season}`);
			assert(Math.max(...second) - Math.min(...second) < 1, `${season}`);
			assert(
				Math.abs(top[0]! / second[0]! - getTvShare(1) / getTvShare(2)) < 0.001,
				`${season}`,
			);
		}

		const events: EventBBGM[] = await idb.league.getAll("events");
		for (const season of completedSeasons) {
			const seasonEvents = events.filter((event) => event.season === season);
			const promotions = seasonEvents.filter(
				(event) => event.type === "promotion",
			);
			assert.strictEqual(promotions.length, 3, `${season}`);
			for (const event of promotions) {
				assert(event.text?.includes("in prize money"), event.text);
			}
			assert.strictEqual(
				seasonEvents.filter(
					(event) =>
						event.type === "playoffs" &&
						event.text?.includes("finished top of") &&
						event.text.includes("in prize money"),
				).length,
				structure.competitionDivisions.length,
				`${season}`,
			);
		}
	});

	test("a club that releases a player pays off the rest of his contract instead of carrying it", async () => {
		const season = g.get("season");
		const userTids = g.get("userTids");
		const p = (await idb.cache.players.getAll()).find(
			(p) =>
				p.tid >= 0 &&
				!userTids.includes(p.tid) &&
				p.contract.exp > season &&
				p.loan === undefined,
		);
		assert(p, "No AI club player with seasons left on his contract");
		const tid = p.tid;
		const { amount, exp } = p.contract;

		const getTeamSeason = async () =>
			(await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
				season,
				tid,
			]))!;
		const cashBefore = (await getTeamSeason()).cash;
		const payrollBefore = await team.getPayroll(tid);

		await player.release(p, false);

		// It's the preseason, so all of this season is still owed
		assert.strictEqual(
			(await getTeamSeason()).cash,
			cashBefore - amount * (exp - season + 1),
		);
		assert.strictEqual(await team.getPayroll(tid), payrollBefore - amount);
		assert.strictEqual(
			(await idb.cache.releasedPlayers.getAll()).filter(
				(row) => row.pid === p.pid,
			).length,
			0,
		);
	});

	test("a club's team page has its stadium, market size rank in its Country, and money", async () => {
		const currentSeason = g.get("season");
		for (const t of await idb.cache.teams.getAll()) {
			const info = (await competition.getClubInfo(t.tid, currentSeason))!;
			assert.strictEqual(info.numClubsInCountry, 2 * CLUBS_PER_DIVISION);
			assert(info.marketRank >= 1 && info.marketRank <= 2 * CLUBS_PER_DIVISION);
			assert(info.stadiumCapacity > 0);
			assert(
				info.transferFunds !== undefined && info.transferFunds >= 0,
				`tid ${t.tid}: transfer funds ${info.transferFunds}`,
			);

			const pastInfo = (await competition.getClubInfo(
				t.tid,
				currentSeason - 1,
			))!;
			assert.strictEqual(pastInfo.transferFunds, undefined);
		}
	});

	test("a club's team page summary counts its academy players and names its best prospect", async () => {
		for (const t of await idb.cache.teams.getAll()) {
			const academyPlayers = await competition.getAcademyPlayers(t.tid);
			const summary = (await competition.getAcademySummary(t.tid))!;
			assert.strictEqual(summary.numPlayers, academyPlayers.length);
			assert(summary.best, `tid ${t.tid} has no best prospect`);
			assert(academyPlayers.some((p) => p.pid === summary.best!.pid));
		}
	});

	test("every club has a youth academy, and there are no draft classes", async () => {
		const players: Player[] = await idb.league.getAll("players");
		const season = g.get("season");
		const { intakeAge, graduationAge, numCohorts } = getAcademyAges(
			g.get("draftAges"),
		);
		const numClubs = structure.competitionDivisions.length * CLUBS_PER_DIVISION;

		// Talent pool players are draft prospects too (see talentPoolMoves.ts)
		const academyPlayers = players.filter(
			(p) => p.tid === PLAYER.UNDRAFTED && p.talentPool === undefined,
		);
		assert(academyPlayers.length > 0, "No academy players");

		for (const p of academyPlayers) {
			assert.notStrictEqual(p.academyTid, undefined, `pid ${p.pid}`);

			// It's the preseason, so the oldest intake graduates this summer
			assert(
				p.draft.year >= season && p.draft.year < season + numCohorts,
				`pid ${p.pid} graduates in ${p.draft.year}`,
			);
			assert.strictEqual(
				season - p.born.year,
				graduationAge - (p.draft.year - season),
				`pid ${p.pid}`,
			);

			// Developed this preseason, like first-team players
			assert.strictEqual(p.ratings.at(-1)!.season, season, `pid ${p.pid}`);
		}

		// The newest intake joined after last summer's promotions, so it was shared
		// out equally. Some may have been sold to other academies since, so count
		// each player for the club he joined.
		const newestIntake = academyPlayers.filter(
			(p) => p.draft.year === season + numCohorts - 1,
		);
		assert.strictEqual(newestIntake.length, getAcademyIntakeSize(numClubs));
		assert.strictEqual(season - newestIntake[0]!.born.year, intakeAge + 1);
		const getIntakeTid = (p: Player) =>
			(p.transactions ?? []).flatMap((row) =>
				row.type === "transfer" ? [row] : [],
			)[0]?.fromTid ?? p.academyTid;
		const perClub = newestIntake.length / numClubs;
		for (let tid = 0; tid < numClubs; tid++) {
			const count = newestIntake.filter((p) => getIntakeTid(p) === tid).length;
			assert(
				count >= Math.floor(perClub) && count <= Math.ceil(perClub),
				`tid ${tid} got ${count}`,
			);
		}
	});

	test("clubs promote academy players to their first teams", async () => {
		const players: Player[] = await idb.league.getAll("players");
		const promotions = players.flatMap((p) =>
			(p.transactions ?? []).flatMap((row) =>
				row.type === "academy" ? [{ p, row }] : [],
			),
		);

		assert(promotions.length > 0, "No academy players were promoted");
		for (const { p, row } of promotions) {
			assert(completedSeasons.includes(row.season), `${row.season}`);
			assert.strictEqual(p.draft.tid, row.tid);
			assert.strictEqual(p.draft.year, row.season);
			assert.strictEqual(p.academyTid, undefined);
			assert.notStrictEqual(p.tid, PLAYER.UNDRAFTED);
		}

		const events: EventBBGM[] = await idb.league.getAll("events");
		assert.strictEqual(
			events.filter((event) => event.type === "academy").length,
			promotions.length,
		);
	});

	test("league tables show every Division's table with its zones, the user's Division first", async () => {
		const season = completedSeasons.at(-1)!;
		const worldTables = await competition.getWorldTables(season);
		assert(worldTables);
		assert(worldTables.seasonOver);

		const tables = await competition.getDivisionTables(season);
		const divisionIdByTid = await getDivisionIdByTid(season);
		const userDivisionId = divisionIdByTid.get(g.get("userTid"));
		assert.strictEqual(worldTables.userDivisionId, userDivisionId);
		assert.strictEqual(worldTables.divisions[0]!.divisionId, userDivisionId);
		assert.deepStrictEqual(
			worldTables.divisions.map((division) => division.divisionId).sort(),
			structure.competitionDivisions.map((division) => division.divisionId),
		);

		for (const division of worldTables.divisions) {
			const table = tables[division.divisionId]!;
			assert.deepStrictEqual(
				division.rows.map((row) => row.tid),
				table.map((row) => row.tid),
			);

			for (const row of division.rows) {
				assert.strictEqual(row.played, NUM_GAMES, `tid ${row.tid}`);
				assert.strictEqual(row.form.length, 5, `tid ${row.tid}`);
				assert.strictEqual(row.scored - row.conceded, row.pointDiff);
			}

			const count = (zone: string) =>
				division.rows.filter((row) => row.zone === zone).length;
			const upperLink = structure.promotionRelegationLinks.find(
				(link) => link.upperDivisionId === division.divisionId,
			);
			const lowerLink = structure.promotionRelegationLinks.find(
				(link) => link.lowerDivisionId === division.divisionId,
			);
			assert.strictEqual(count("relegation"), upperLink?.numAutoRelegated ?? 0);
			assert.strictEqual(count("promotion"), lowerLink?.numAutoPromoted ?? 0);
			assert.strictEqual(
				count("promotionPlayoff"),
				lowerLink?.numPromotionPlayoffTeams ?? 0,
			);
		}
	});

	test("promotion playoff games are recorded and shown as brackets", async () => {
		const results = (g as unknown as Partial<GameAttributesLeague>)
			.promotionPlayoffResults;
		assert(results, "No promotion playoff results");

		for (const season of completedSeasons) {
			// Southland's playoff has 4 clubs for 1 spot: 2 semifinals and a final
			const games = results.filter((game) => game.season === season);
			assert.strictEqual(games.length, 3, `${season}`);
			for (const game of games) {
				assert.strictEqual(game.linkId, 2);
				assert([game.homeTid, game.awayTid].includes(game.winnerTid));

				// Saved like a playoff game: a box score, and the players' playoff stats
				assert(game.gid !== undefined, `${season} game has no box score`);
				const boxScore =
					(await idb.cache.games.get(game.gid)) ??
					(await idb.league.get("games", game.gid));
				assert(boxScore, `${season} box score ${game.gid} not found`);
				assert.strictEqual(boxScore.playoffs, true);
				assert.strictEqual(boxScore.season, season);
				assert.notStrictEqual(
					boxScore.day,
					undefined,
					`${season} promotion playoff game was not played from the schedule`,
				);
				assert.deepStrictEqual(
					boxScore.teams.map((t) => [t.tid, t.pts]),
					[
						[game.homeTid, game.homePts],
						[game.awayTid, game.awayPts],
					],
				);

				const boxScorePlayer = boxScore.teams[0].players.find((p) => p.min > 0);
				assert(boxScorePlayer, `${season} box score has no players`);
				const p =
					(await idb.cache.players.get(boxScorePlayer.pid)) ??
					(await idb.league.get("players", boxScorePlayer.pid));
				assert(
					p?.stats.some(
						(row) =>
							row.season === season &&
							row.playoffs &&
							row.tid === game.homeTid &&
							row.gp > 0,
					),
					`pid ${boxScorePlayer.pid} has no playoff stats for ${season}`,
				);
			}

			const brackets = await competition.getPromotionPlayoffBrackets(season);
			assert(brackets);
			assert.strictEqual(brackets.length, 1, `${season}`);
			const bracket = brackets[0]!;
			assert.strictEqual(bracket.participants.length, 4);
			assert.deepStrictEqual(
				bracket.rounds.map((round) => round.length),
				[2, 1],
				`${season}`,
			);

			// The final's winner went up
			const after = await getDivisionIdByTid(season + 1);
			assert.strictEqual(after.get(bracket.rounds[1]![0]!.winnerTid), 3);
		}
	});

	test("the academy page shows the user's academy players", async () => {
		const userTid = g.get("userTid");
		const data = await academyView(
			{ tid: userTid, abbrev: g.get("teamInfoCache")[userTid]!.abbrev },
			["firstRun"],
			{},
		);
		const players = data && "players" in data ? data.players : undefined;
		assert(data && players, "No academy page data");
		assert.strictEqual(data.canManage, true);

		const academyPlayers = await competition.getAcademyPlayers(userTid);
		assert(academyPlayers.length > 0);
		assert.deepStrictEqual(
			players.map((p) => p.pid).sort(byTid),
			academyPlayers.map((p) => p.pid).sort(byTid),
		);
	});

	// Changes the league, so it goes last
	test("the user can promote and release academy players, and undecided graduates become free agents", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");
		const [promoted, released, graduate, ...rest] =
			await competition.getAcademyPlayers(userTid);
		assert(promoted && released && graduate, "Not enough academy players");

		await competition.promoteAcademyPlayer(promoted, userTid);
		const p1 = (await idb.cache.players.get(promoted.pid))!;
		assert.strictEqual(p1.tid, userTid);
		assert.strictEqual(p1.academyTid, undefined);
		assert.strictEqual(p1.contract.amount, g.get("minContract"));
		assert.strictEqual(p1.contract.rookie, true);
		// Promoted in the preseason, so this season is the first of 3
		assert.strictEqual(p1.contract.exp, season + 2);
		assert.strictEqual(p1.transactions!.at(-1)!.type, "academy");

		await competition.releaseAcademyPlayer(released);
		const p2 = (await idb.cache.players.get(released.pid))!;
		assert.strictEqual(p2.tid, PLAYER.FREE_AGENT);
		assert.strictEqual(p2.academyTid, undefined);

		graduate.draft.year = season;
		await idb.cache.players.put(graduate);
		await competition.releaseUndecidedGraduates();
		const p3 = (await idb.cache.players.get(graduate.pid))!;
		assert.strictEqual(p3.tid, PLAYER.FREE_AGENT);
		assert.strictEqual(p3.academyTid, undefined);

		// Everyone else in the academy is still there
		for (const p of rest) {
			const p4 = (await idb.cache.players.get(p.pid))!;
			assert.strictEqual(p4.tid, PLAYER.UNDRAFTED);
			assert.strictEqual(p4.academyTid, userTid);
		}
	});

	// Changes the league, so it goes last
	test("the user buys a player by offering his club's asking price, after a lowball offer is turned down", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");

		// Plenty of cash and wage budget and a small roster, so only the offer
		// decides
		const userSeason = (await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, userTid],
		))!;
		userSeason.cash = 1e9;
		await idb.cache.teamSeasons.put(userSeason);
		// No maximum contract in a World, so keep the lowest paid players
		const userRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		);
		userRoster.sort((a, b) => a.contract.amount - b.contract.amount);
		for (const p of userRoster.slice(3)) {
			await player.addToFreeAgents(p, {});
			await idb.cache.players.put(p);
		}
		for (const releasedPlayer of await idb.cache.releasedPlayers.indexGetAll(
			"releasedPlayersByTid",
			userTid,
		)) {
			await idb.cache.releasedPlayers.delete(releasedPlayer.rid);
		}

		const players = await idb.cache.players.indexGetAll("playersByTid", [
			0,
			Infinity,
		]);
		const rosterSizes = new Map<number, number>();
		for (const p of players) {
			rosterSizes.set(p.tid, (rosterSizes.get(p.tid) ?? 0) + 1);
		}
		const target = players
			.filter(
				(p) =>
					p.tid !== userTid &&
					p.contract.exp >= season &&
					p.gamesUntilTradable === 0 &&
					rosterSizes.get(p.tid)! > g.get("minRosterSize"),
			)
			.sort((a, b) => a.contract.amount - b.contract.amount)[0];
		assert(target, "No player to buy");
		const sellerTid = target.tid;

		const lowball = await competition.makeTransferOffer({
			pid: target.pid,
			fee: 1,
		});
		assert.strictEqual(lowball.type, "reject", lowball.message);

		const again = await competition.makeTransferOffer({
			pid: target.pid,
			fee: 1,
		});
		assert.strictEqual(again.type, "error", again.message);

		// More than any club asks
		const fee = 1e7;
		const sellerCash = (await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, sellerTid],
		))!.cash;
		const accepted = await competition.makeTransferOffer({
			pid: target.pid,
			fee,
		});
		assert.strictEqual(accepted.type, "accept", accepted.message);

		assert.strictEqual((await idb.cache.players.get(target.pid))!.tid, userTid);
		const cash = async (tid: number) =>
			(await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
				season,
				tid,
			]))!.cash;
		assert.strictEqual(await cash(userTid), 1e9 - fee);
		assert.strictEqual(await cash(sellerTid), sellerCash + fee);
	});

	// Changes the league, so it goes last
	test("the user can accept or reject AI clubs' offers for their players, and list players for sale", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");

		// The user's two lowest paid players, made tradable, so only the offers
		// decide. Late free agent signings often can't be traded yet.
		const [sold, kept] = (
			await idb.cache.players.indexGetAll("playersByTid", userTid)
		).sort((a, b) => a.contract.amount - b.contract.amount);
		assert(sold && kept, "Not enough players to sell");
		for (const p of [sold, kept]) {
			p.gamesUntilTradable = 0;
			p.contract.exp = Math.max(p.contract.exp, season);
			await idb.cache.players.put(p);
		}

		// An AI club with plenty of cash and room in its roster and wage budget,
		// so only the offer decides
		const buyerTid = (await idb.cache.teams.getAll()).find(
			(t) => !t.disabled && t.tid !== userTid,
		)!.tid;
		const wageBudget = (await getWageBudgets()).get(buyerTid)!;
		for (const releasedPlayer of await idb.cache.releasedPlayers.indexGetAll(
			"releasedPlayersByTid",
			buyerTid,
		)) {
			await idb.cache.releasedPlayers.delete(releasedPlayer.rid);
		}
		const buyerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			buyerTid,
		);
		buyerRoster.sort((a, b) => b.contract.amount - a.contract.amount);
		for (const p of buyerRoster) {
			const rosterSize = (
				await idb.cache.players.indexGetAll("playersByTid", buyerTid)
			).length;
			if (
				rosterSize < g.get("maxRosterSize") &&
				(await team.getPayroll(buyerTid)) + sold.contract.amount <= wageBudget
			) {
				break;
			}
			await player.addToFreeAgents(p, {});
			await idb.cache.players.put(p);
		}
		const buyerSeason = (await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, buyerTid],
		))!;
		buyerSeason.cash = 1e9;
		await idb.cache.teamSeasons.put(buyerSeason);

		for (const p of [sold, kept]) {
			p.transferOffers = [{ tid: buyerTid, fee: 1000, daysLeft: 3 }];
			await idb.cache.players.put(p);
		}

		assert.strictEqual(
			await competition.acceptAiTransferOffer({
				pid: sold.pid,
				tid: buyerTid,
			}),
			undefined,
		);
		const p1 = (await idb.cache.players.get(sold.pid))!;
		assert.strictEqual(p1.tid, buyerTid);
		assert.strictEqual(p1.transferOffers, undefined);
		assert.strictEqual(p1.transactions!.at(-1)!.type, "transfer");

		await competition.rejectAiTransferOffer({ pid: kept.pid, tid: buyerTid });
		const p2 = (await idb.cache.players.get(kept.pid))!;
		assert.strictEqual(p2.tid, userTid);
		assert.strictEqual(p2.transferOffers, undefined);

		await competition.setTransferListed({ pid: kept.pid, listed: true });
		assert.strictEqual(
			(await idb.cache.players.get(kept.pid))!.transferListed,
			true,
		);

		// Whatever AI clubs offer, it's for the user's players, from other clubs
		await competition.makeAiTransferOffers(100);
		for (const p of await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		)) {
			for (const offer of p.transferOffers ?? []) {
				assert.notStrictEqual(offer.tid, userTid);
				assert(offer.fee > 0);
				assert.strictEqual(offer.daysLeft, 3);
			}
		}

		await competition.setTransferListed({ pid: kept.pid, listed: false });
		assert.strictEqual(
			(await idb.cache.players.get(kept.pid))!.transferListed,
			undefined,
		);
	});

	// Changes the league, so it goes last
	test("the user buys an academy player into their academy, and AI clubs buy academy players from each other", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");

		// Plenty of cash for every club, so only the rules decide
		const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
		for (const t of teams) {
			const teamSeason = (await idb.cache.teamSeasons.indexGet(
				"teamSeasonsBySeasonTid",
				[season, t.tid],
			))!;
			teamSeason.cash = 1e9;
			await idb.cache.teamSeasons.put(teamSeason);
		}

		const target = (await competition.getAcademyPlayers()).find(
			(p) => p.academyTid !== userTid && p.draft.year > season,
		);
		assert(target, "No academy player to buy");
		const sellerTid = target.academyTid!;

		// More than any club asks
		const fee = 1e7;
		const accepted = await competition.makeTransferOffer({
			pid: target.pid,
			fee,
		});
		assert.strictEqual(accepted.type, "accept", accepted.message);

		const bought = (await idb.cache.players.get(target.pid))!;
		assert.strictEqual(bought.tid, PLAYER.UNDRAFTED);
		assert.strictEqual(bought.academyTid, userTid);
		const transaction = bought.transactions!.at(-1)!;
		assert(transaction.type === "transfer");
		assert.strictEqual(transaction.tid, userTid);
		assert.strictEqual(transaction.fromTid, sellerTid);

		const aiTids = teams.map((t) => t.tid).filter((tid) => tid !== userTid);
		const academyTidsBefore = new Map(
			(await competition.getAcademyPlayers()).map((p) => [
				p.pid,
				p.academyTid!,
			]),
		);
		const numTransfers = await competition.academyTransfersBetweenAiClubs(
			200,
			aiTids,
		);
		assert(numTransfers > 0, "No academy transfers happened");

		let numMoved = 0;
		for (const p of await competition.getAcademyPlayers()) {
			const academyTidBefore = academyTidsBefore.get(p.pid)!;
			if (academyTidBefore === p.academyTid) {
				continue;
			}
			numMoved += 1;
			assert(aiTids.includes(academyTidBefore));
			assert(aiTids.includes(p.academyTid!));
			assert.strictEqual(p.tid, PLAYER.UNDRAFTED);
			assert.strictEqual(p.transactions!.at(-1)!.tid, p.academyTid);
		}
		assert(numMoved > 0 && numMoved <= numTransfers);
	});

	// Changes the league, so it goes last
	test("the user can sell academy players to AI clubs that make offers for them", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");

		// Every club still has plenty of cash from the last test
		const [sold, listed] = (await competition.getAcademyPlayers(userTid))
			.filter((p) => p.draft.year > season)
			.sort((a, b) => b.value - a.value);
		assert(sold && listed, "Not enough academy players to sell");

		const buyerTid = (await idb.cache.teams.getAll()).find(
			(t) => !t.disabled && t.tid !== userTid,
		)!.tid;
		const cash = async (tid: number) =>
			(await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
				season,
				tid,
			]))!.cash;
		const buyerCash = await cash(buyerTid);

		sold.transferOffers = [{ tid: buyerTid, fee: 1000, daysLeft: 3 }];
		await idb.cache.players.put(sold);
		assert.strictEqual(
			await competition.acceptAiTransferOffer({
				pid: sold.pid,
				tid: buyerTid,
			}),
			undefined,
		);
		const p1 = (await idb.cache.players.get(sold.pid))!;
		assert.strictEqual(p1.tid, PLAYER.UNDRAFTED);
		assert.strictEqual(p1.academyTid, buyerTid);
		assert.strictEqual(p1.transferOffers, undefined);
		assert.strictEqual(await cash(buyerTid), buyerCash - 1000);

		// AI clubs make offers for the user's academy players, including ones on
		// the transfer list
		await competition.setTransferListed({ pid: listed.pid, listed: true });
		assert.strictEqual(
			(await idb.cache.players.get(listed.pid))!.transferListed,
			true,
		);
		// Worth more than any academy player, so every AI club would want him
		const listedPlayer = (await idb.cache.players.get(listed.pid))!;
		listedPlayer.value =
			Math.max(...(await competition.getAcademyPlayers()).map((p) => p.value)) +
			1;
		await idb.cache.players.put(listedPlayer);

		const numOffers = await competition.makeAiTransferOffers(200, true);
		assert(numOffers > 0, "No offers for academy players");
		let numOffersFound = 0;
		for (const p of await competition.getAcademyPlayers(userTid)) {
			for (const offer of p.transferOffers ?? []) {
				numOffersFound += 1;
				assert.notStrictEqual(offer.tid, userTid);
				assert(offer.fee > 0);
				assert.strictEqual(offer.daysLeft, 3);
			}
		}
		assert.strictEqual(numOffersFound, numOffers);
	});

	// Changes the league, so it goes last
	test("AI clubs loan young players to each other, and loans end in the summer", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");
		const maxRosterSize = g.get("maxRosterSize");

		// Loans made during auto play ended on time
		for (const p of await idb.cache.players.indexGetAll("playersByTid", [
			0,
			Infinity,
		])) {
			if (p.loan) {
				assert(
					p.loan.season >= season,
					`pid ${p.pid}'s loan ended in ${p.loan.season}`,
				);
				assert.notStrictEqual(p.loan.tid, p.tid);
			}
		}

		// Every AI club one below the roster limit, so it can lend and borrow
		const aiTids = (await idb.cache.teams.getAll())
			.filter((t) => !t.disabled && t.tid !== userTid)
			.map((t) => t.tid);
		for (const tid of aiTids) {
			const roster = (
				await idb.cache.players.indexGetAll("playersByTid", tid)
			).sort((a, b) => a.value - b.value);
			const numOver = roster.length - (maxRosterSize - 1);
			for (const p of roster.slice(0, Math.max(0, numOver))) {
				await player.addToFreeAgents(p, {});
				await idb.cache.players.put(p);
			}
		}

		// The club each player is at, or in the academy of
		const academyPlayersBefore = await competition.getAcademyPlayers();
		const academyPids = new Set(academyPlayersBefore.map((p) => p.pid));
		const tidsBefore = new Map([
			...(
				await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
			).map((p) => [p.pid, p.tid] as const),
			...academyPlayersBefore.map((p) => [p.pid, p.academyTid!] as const),
		]);
		const numLoans = await competition.loansBetweenAiClubs(500, aiTids);
		assert(numLoans > 0, "No loans happened");

		const loaned = (
			await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
		).filter((p) => p.loan !== undefined && tidsBefore.get(p.pid) !== p.tid);
		assert(loaned.length > 0 && loaned.length <= numLoans);
		const borrowerTids = new Map(loaned.map((p) => [p.pid, p.tid]));
		for (const p of loaned) {
			const lenderTid = tidsBefore.get(p.pid)!;
			assert.strictEqual(p.loan!.tid, lenderTid);
			assert.strictEqual(p.loan!.season, season);
			assert.strictEqual(
				p.loan!.academy,
				academyPids.has(p.pid) ? true : undefined,
			);
			assert(aiTids.includes(p.tid));
			assert(season - p.born.year <= LOAN_MAX_AGE);
			const transaction = p.transactions!.at(-1)!;
			assert(transaction.type === "loan");
			assert.strictEqual(transaction.tid, p.tid);
			assert.strictEqual(transaction.fromTid, lenderTid);
		}
		for (const tid of aiTids) {
			assert(
				(await idb.cache.players.indexGetAll("playersByTid", tid)).length <=
					maxRosterSize,
			);
		}

		// Loans made in the preseason end this summer
		await competition.returnLoans();
		for (const { pid } of loaned) {
			const p = (await idb.cache.players.get(pid))!;
			assert.strictEqual(p.loan, undefined);
			const transaction = p.transactions!.at(-1)!;
			assert(transaction.type === "loanReturn");
			assert.strictEqual(transaction.tid, tidsBefore.get(pid));
			assert.strictEqual(transaction.fromTid, borrowerTids.get(pid));

			// Back at his club, unless it went over the roster limit and released
			// him, or back in its academy
			if (academyPids.has(pid)) {
				assert.strictEqual(p.tid, PLAYER.UNDRAFTED);
				assert.strictEqual(p.academyTid, tidsBefore.get(pid));
			} else {
				assert(
					p.tid === tidsBefore.get(pid) || p.tid === PLAYER.FREE_AGENT,
					`pid ${pid} is at tid ${p.tid}`,
				);
			}
		}
	});

	// Changes the league, so it goes last
	test("the user borrows a player from an AI club, and lends one to an AI club that asks", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");
		const minContract = g.get("minContract");

		// A young player on the bench at an AI club, with a contract through the
		// season
		const aiTeams = (await idb.cache.teams.getAll()).filter(
			(t) => !t.disabled && t.tid !== userTid,
		);
		let lenderTid: number | undefined;
		for (const t of aiTeams) {
			const roster = await idb.cache.players.indexGetAll("playersByTid", t.tid);
			if (
				roster.length >
				Math.max(g.get("minRosterSize"), 2 * g.get("numPlayersOnCourt"))
			) {
				lenderTid = t.tid;
				break;
			}
		}
		assert(lenderTid !== undefined, "No AI club with a big enough roster");
		const lenderRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			lenderTid,
		);
		const bench = lenderRoster
			.filter((p) => p.loan === undefined)
			.sort((a, b) => a.valueNoPot - b.valueNoPot)[0]!;
		bench.born.year = season - 20;
		// The shared summer plan makes a development loan available only for a
		// young reserve with meaningful upside.
		bench.value = bench.valueNoPot + 8;
		bench.gamesUntilTradable = 0;
		bench.contract.amount = minContract;
		bench.contract.exp = Math.max(bench.contract.exp, season);
		await idb.cache.players.put(bench);

		const borrowed = await competition.requestLoan({ pid: bench.pid });
		assert.strictEqual(borrowed.type, "accept", borrowed.message);
		const p1 = (await idb.cache.players.get(bench.pid))!;
		assert.strictEqual(p1.tid, userTid);
		assert.deepStrictEqual(p1.loan, { tid: lenderTid, season });

		// Clubs don't lend out older players
		const veteran = lenderRoster.find(
			(p) =>
				p.pid !== bench.pid &&
				p.loan === undefined &&
				season - p.born.year > LOAN_MAX_AGE &&
				p.gamesUntilTradable === 0 &&
				p.contract.exp >= season,
		);
		if (veteran) {
			veteran.contract.amount = minContract;
			await idb.cache.players.put(veteran);
			const refused = await competition.requestLoan({ pid: veteran.pid });
			assert.strictEqual(refused.type, "reject", refused.message);
		}

		// A player on loan goes back to his club when released
		await competition.returnLoan(p1);
		assert.strictEqual(
			(await idb.cache.players.get(bench.pid))!.tid,
			lenderTid,
		);

		// The user lends a player to an AI club that asked, with room for him
		const lent = (await idb.cache.players.indexGetAll("playersByTid", userTid))
			.filter((p) => p.loan === undefined)
			.sort((a, b) => a.value - b.value)[0];
		assert(lent, "No user player to lend");
		lent.gamesUntilTradable = 0;
		lent.contract.amount = minContract;
		lent.contract.exp = Math.max(lent.contract.exp, season);
		await idb.cache.players.put(lent);
		assert.strictEqual(
			await competition.setLoanListed({ pid: lent.pid, listed: true }),
			undefined,
		);

		let borrowerTid: number | undefined;
		for (const t of aiTeams) {
			const roster = await idb.cache.players.indexGetAll("playersByTid", t.tid);
			if (roster.length < g.get("maxRosterSize")) {
				borrowerTid = t.tid;
				break;
			}
		}
		assert(borrowerTid !== undefined, "No AI club with room to borrow");

		// Room in the borrower's wage budget too, since it pays his wages
		for (const releasedPlayer of await idb.cache.releasedPlayers.indexGetAll(
			"releasedPlayersByTid",
			borrowerTid,
		)) {
			await idb.cache.releasedPlayers.delete(releasedPlayer.rid);
		}
		const borrowerWageBudget = (await getWageBudgets()).get(borrowerTid)!;
		const borrowerRoster = (
			await idb.cache.players.indexGetAll("playersByTid", borrowerTid)
		).sort((a, b) => b.contract.amount - a.contract.amount);
		for (const p of borrowerRoster) {
			if (
				(await team.getPayroll(borrowerTid)) + lent.contract.amount <=
				borrowerWageBudget
			) {
				break;
			}
			await player.addToFreeAgents(p, {});
			await idb.cache.players.put(p);
		}

		lent.transferOffers = [
			{ tid: borrowerTid, fee: 0, daysLeft: 3, loan: true },
		];
		await idb.cache.players.put(lent);
		assert.strictEqual(
			await competition.acceptAiTransferOffer({
				pid: lent.pid,
				tid: borrowerTid,
			}),
			undefined,
		);
		const p2 = (await idb.cache.players.get(lent.pid))!;
		assert.strictEqual(p2.tid, borrowerTid);
		assert.deepStrictEqual(p2.loan, { tid: userTid, season });
		assert.strictEqual(p2.loanListed, undefined);
		assert.strictEqual(p2.transferOffers, undefined);

		// AI clubs' requests for players on the user's loan list are well-formed
		for (const p of await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		)) {
			if (p.loan === undefined) {
				p.loanListed = true;
				await idb.cache.players.put(p);
			}
		}
		await competition.makeAiLoanRequests(200);
		for (const p of await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		)) {
			for (const offer of p.transferOffers ?? []) {
				if (offer.loan) {
					assert.notStrictEqual(offer.tid, userTid);
					assert.strictEqual(offer.fee, 0);
					assert.strictEqual(offer.daysLeft, 3);
				}
			}
		}
	});

	// Changes the league, so it goes last
	test("academy players 18 or older go on loan until the summer, and come back to their academy", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");
		const minContract = g.get("minContract");
		const endSeason = getLoanEndSeason({ season, phase: g.get("phase") });

		// Academy loans made during auto play don't outlast the player's academy
		for (const p of await idb.cache.players.indexGetAll("playersByTid", [
			0,
			Infinity,
		])) {
			if (p.loan?.academy) {
				assert.strictEqual(p.academyTid, undefined);
				assert(p.draft.year >= p.loan.season, `pid ${p.pid}`);
			}
		}

		// The user borrows an AI club's academy player who isn't ready for its
		// first team, once he's old enough
		const aiProspect = (await competition.getAcademyPlayers()).find(
			(p) => p.academyTid !== userTid && p.draft.year >= endSeason,
		);
		assert(aiProspect, "No AI academy player");
		const lenderTid = aiProspect.academyTid!;
		aiProspect.valueNoPot = 0;
		aiProspect.born.year = season - (ACADEMY_LOAN_MIN_AGE - 1);
		await idb.cache.players.put(aiProspect);
		const tooYoung = await competition.requestLoan({ pid: aiProspect.pid });
		assert.strictEqual(tooYoung.type, "error", tooYoung.message);

		aiProspect.born.year = season - ACADEMY_LOAN_MIN_AGE;
		await idb.cache.players.put(aiProspect);
		const borrowed = await competition.requestLoan({ pid: aiProspect.pid });
		assert.strictEqual(borrowed.type, "accept", borrowed.message);
		const p1 = (await idb.cache.players.get(aiProspect.pid))!;
		assert.strictEqual(p1.tid, userTid);
		assert.deepStrictEqual(p1.loan, {
			tid: lenderTid,
			season: endSeason,
			academy: true,
		});
		assert.strictEqual(p1.academyTid, undefined);
		assert.strictEqual(p1.contract.amount, minContract);
		assert.strictEqual(p1.contract.exp, endSeason);
		assert(
			!(await competition.getAcademyPlayers(lenderTid)).some(
				(p) => p.pid === p1.pid,
			),
		);

		// The user lends one of their own academy players to an AI club that asks
		const userProspect = (await competition.getAcademyPlayers(userTid)).find(
			(p) => p.draft.year >= endSeason,
		);
		assert(userProspect, "No user academy player");
		userProspect.born.year = season - (ACADEMY_LOAN_MIN_AGE - 1);
		await idb.cache.players.put(userProspect);
		assert.notStrictEqual(
			await competition.setLoanListed({ pid: userProspect.pid, listed: true }),
			undefined,
		);
		userProspect.born.year = season - ACADEMY_LOAN_MIN_AGE;
		await idb.cache.players.put(userProspect);
		assert.strictEqual(
			await competition.setLoanListed({ pid: userProspect.pid, listed: true }),
			undefined,
		);

		let borrowerTid: number | undefined;
		for (const t of await idb.cache.teams.getAll()) {
			if (t.disabled || t.tid === userTid) {
				continue;
			}
			const roster = await idb.cache.players.indexGetAll("playersByTid", t.tid);
			if (roster.length < g.get("maxRosterSize")) {
				borrowerTid = t.tid;
				break;
			}
		}
		assert(borrowerTid !== undefined, "No AI club with room to borrow");

		// Room in the borrower's wage budget for the minimum wage
		for (const releasedPlayer of await idb.cache.releasedPlayers.indexGetAll(
			"releasedPlayersByTid",
			borrowerTid,
		)) {
			await idb.cache.releasedPlayers.delete(releasedPlayer.rid);
		}
		const borrowerWageBudget = (await getWageBudgets()).get(borrowerTid)!;
		const borrowerRoster = (
			await idb.cache.players.indexGetAll("playersByTid", borrowerTid)
		).sort((a, b) => b.contract.amount - a.contract.amount);
		for (const p of borrowerRoster) {
			if (
				(await team.getPayroll(borrowerTid)) + minContract <=
				borrowerWageBudget
			) {
				break;
			}
			await player.addToFreeAgents(p, {});
			await idb.cache.players.put(p);
		}

		const listed = (await idb.cache.players.get(userProspect.pid))!;
		listed.transferOffers = [
			{ tid: borrowerTid, fee: 0, daysLeft: 3, loan: true },
		];
		await idb.cache.players.put(listed);
		assert.strictEqual(
			await competition.acceptAiTransferOffer({
				pid: userProspect.pid,
				tid: borrowerTid,
			}),
			undefined,
		);
		const p2 = (await idb.cache.players.get(userProspect.pid))!;
		assert.strictEqual(p2.tid, borrowerTid);
		assert.deepStrictEqual(p2.loan, {
			tid: userTid,
			season: endSeason,
			academy: true,
		});
		assert.strictEqual(p2.contract.amount, minContract);
		assert.strictEqual(p2.loanListed, undefined);

		// Loans end in the summer, and academy players go back to their academies
		await competition.returnLoans();
		for (const [pid, academyTid] of [
			[p1.pid, lenderTid],
			[p2.pid, userTid],
		] as const) {
			const p = (await idb.cache.players.get(pid))!;
			assert.strictEqual(p.loan, undefined);
			assert.strictEqual(p.tid, PLAYER.UNDRAFTED);
			assert.strictEqual(p.academyTid, academyTid);
			assert(
				(await competition.getAcademyPlayers(academyTid)).some(
					(p2) => p2.pid === pid,
				),
			);
			assert.strictEqual(p.transactions!.at(-1)!.type, "loanReturn");
		}
	});

	// Changes the league, so it goes last
	test("the international talent pool arrives with a transfer window, clubs sign from it, and the rest leave", async () => {
		const season = g.get("season");
		const userTid = g.get("userTid");

		assert(
			await competition.getCurrentTransferWindow(),
			"No transfer window open",
		);

		// Auto play's summer pool arrived already, and clubs signed some of it, so
		// this window's pool arrives again from scratch
		await player.remove(
			(await competition.getTalentPoolPlayers()).map((p) => p.pid),
		);
		delete (g as unknown as { talentPoolKey?: string }).talentPoolKey;

		await competition.ensureTalentPool();
		const pool = await competition.getTalentPoolPlayers();
		assert.strictEqual(pool.length, getTalentPoolSize(g.get("numActiveTeams")));
		const worldCountries = new Set(
			structure.countries.map((country) => country.name),
		);
		for (const p of pool) {
			assert(!worldCountries.has(p.born.loc), p.born.loc);
			const age = season - p.born.year;
			assert(
				age >= TALENT_POOL_MIN_AGE && age <= TALENT_POOL_MAX_AGE,
				`age ${age}`,
			);
		}

		// It only arrives once a window
		await competition.ensureTalentPool();
		assert.strictEqual(
			(await competition.getTalentPoolPlayers()).length,
			pool.length,
		);

		// The user signs the cheapest pool player, with room on their roster and
		// in their wage budget, and the cash for his fee
		const target = [...pool].sort(
			(a, b) =>
				competition.getTalentPoolFee(a) - competition.getTalentPoolFee(b),
		)[0]!;
		const fee = competition.getTalentPoolFee(target);
		for (const releasedPlayer of await idb.cache.releasedPlayers.indexGetAll(
			"releasedPlayersByTid",
			userTid,
		)) {
			await idb.cache.releasedPlayers.delete(releasedPlayer.rid);
		}
		const wageBudget = (await getWageBudgets()).get(userTid)!;
		const userRoster = (
			await idb.cache.players.indexGetAll("playersByTid", userTid)
		).sort((a, b) => b.contract.amount - a.contract.amount);
		for (const p of userRoster) {
			if (
				(await idb.cache.players.indexGetAll("playersByTid", userTid)).length <
					g.get("maxRosterSize") &&
				(await team.getPayroll(userTid)) +
					competition.getTalentPoolWage(target) <=
					wageBudget
			) {
				break;
			}
			await player.addToFreeAgents(p, {});
			await idb.cache.players.put(p);
		}
		const userSeason = (await idb.cache.teamSeasons.indexGet(
			"teamSeasonsBySeasonTid",
			[season, userTid],
		))!;
		userSeason.cash = Math.max(userSeason.cash, fee);
		await idb.cache.teamSeasons.put(userSeason);
		const cashBefore = userSeason.cash;

		const signed = await competition.signTalentPoolPlayer({ pid: target.pid });
		assert.strictEqual(signed.type, "accept", signed.message);
		const p1 = (await idb.cache.players.get(target.pid))!;
		assert.strictEqual(p1.tid, userTid);
		assert.strictEqual(p1.talentPool, undefined);
		const transaction = p1.transactions!.at(-1)!;
		assert(transaction.type === "talentPool");
		assert.strictEqual(transaction.fee, fee);
		assert.strictEqual(
			(await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
				season,
				userTid,
			]))!.cash,
			cashBefore - fee,
		);
		assert.strictEqual(
			(await competition.getTalentPoolPlayers()).length,
			pool.length - 1,
		);

		// AI clubs sign pool players who'd be in their rotation, with room on their
		// roster and in their wage budget, and the cash for the fee
		const aiTids = (await idb.cache.teams.getAll())
			.filter((t) => !t.disabled && t.tid !== userTid)
			.map((t) => t.tid);
		for (const tid of aiTids) {
			// Short of a rotation, so anyone would get minutes
			const roster = (
				await idb.cache.players.indexGetAll("playersByTid", tid)
			).sort((a, b) => a.value - b.value);
			const numOver = roster.length - (2 * g.get("numPlayersOnCourt") - 1);
			for (const p of roster.slice(0, Math.max(0, numOver))) {
				await player.addToFreeAgents(p, {});
				await idb.cache.players.put(p);
			}
			const aiSeason = (await idb.cache.teamSeasons.indexGet(
				"teamSeasonsBySeasonTid",
				[season, tid],
			))!;
			aiSeason.cash = Math.max(aiSeason.cash, 100_000);
			await idb.cache.teamSeasons.put(aiSeason);
		}
		const numSigned = await competition.aiTalentPoolSignings(200, aiTids);
		assert(numSigned > 0, "No AI club signed a pool player");
		const left = await competition.getTalentPoolPlayers();
		assert.strictEqual(left.length, pool.length - 1 - numSigned);

		// When the window closes, players nobody signed leave
		for (const p of left) {
			p.talentPool = `${season - 1}-winter`;
			await idb.cache.players.put(p);
		}
		await competition.removeStaleTalentPool();
		for (const p of left) {
			assert.strictEqual(await idb.cache.players.get(p.pid), undefined);
		}
	});
});
