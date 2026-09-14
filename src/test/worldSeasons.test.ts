import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE, PLAYER } from "../common/constants.ts";
import type {
	EventBBGM,
	GameAttributesLeague,
	HeadToHead,
	Player,
} from "../common/types.ts";
import type { CompetitionStructure } from "../worker/core/competition/competitionStructure.ts";
import {
	getAcademyAges,
	getAcademyIntakeSize,
} from "../worker/core/competition/youthAcademy.ts";
import { competition, league, player, team } from "../worker/core/index.ts";
import { getWageBudgets } from "../worker/core/competition/wageBudgets.ts";
import { LOAN_MAX_AGE } from "../worker/core/competition/loans.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import academyView from "../worker/views/academy.ts";
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

		const events: EventBBGM[] = await idb.league.getAll("events");
		assert.strictEqual(
			events.filter((event) => event.type === "transfer").length,
			transfers.length,
		);
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

		const academyPlayers = players.filter((p) => p.tid === PLAYER.UNDRAFTED);
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

		const tidsBefore = new Map(
			(await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])).map(
				(p) => [p.pid, p.tid],
			),
		);
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

			// Back at his club, unless it went over the roster limit and released him
			assert(
				p.tid === tidsBefore.get(pid) || p.tid === PLAYER.FREE_AGENT,
				`pid ${pid} is at tid ${p.tid}`,
			);
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
			if (roster.length >= 12) {
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
});
