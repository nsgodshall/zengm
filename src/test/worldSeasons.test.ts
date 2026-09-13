import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE, PLAYER } from "../common/constants.ts";
import type { EventBBGM, HeadToHead, Player } from "../common/types.ts";
import type { CompetitionStructure } from "../worker/core/competition/competitionStructure.ts";
import {
	getAcademyAges,
	getAcademyIntakeSize,
} from "../worker/core/competition/youthAcademy.ts";
import { competition, league } from "../worker/core/index.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import { getDefaultSettings } from "../worker/views/newLeague.ts";

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
					...getDefaultSettings(),
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

		// The newest intake joined after last summer's promotions, so it's still
		// shared out equally
		const newestIntake = academyPlayers.filter(
			(p) => p.draft.year === season + numCohorts - 1,
		);
		assert.strictEqual(newestIntake.length, getAcademyIntakeSize(numClubs));
		assert.strictEqual(season - newestIntake[0]!.born.year, intakeAge + 1);
		const perClub = newestIntake.length / numClubs;
		for (let tid = 0; tid < numClubs; tid++) {
			const count = newestIntake.filter((p) => p.academyTid === tid).length;
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
});
