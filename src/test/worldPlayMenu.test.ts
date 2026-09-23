// International Soccer Zen GM mod (storytelling): the Play menu's own path
// through a World's playoffs. worldSeasons.test.ts drives whole seasons with
// autoPlay, which never asks how many days are left, so it couldn't see the
// Play menu counting only the promotion playoffs and stopping the phase dead
// before the Champions League had played (see api/playMenu.ts).
import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE } from "../common/constants.ts";
import type { GameAttributesLeague } from "../common/types.ts";
import type { CompetitionStructure } from "../worker/core/competition/competitionStructure.ts";
import { competition, league } from "../worker/core/index.ts";
import { getWorldDefaultSettings } from "../worker/views/newLeague.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import playMenu from "../worker/api/playMenu.ts";

const STARTING_SEASON = 2026;
const CLUBS_PER_DIVISION = 6;
const NUM_GAMES = 10;

// Two Countries, and both promote and relegate automatically, so the promotion
// playoffs are worth no days at all - the case where counting only them leaves
// the Champions League unplayed
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
			numAutoRelegated: 1,
			numPromotionPlayoffTeams: 0,
			numPromotionPlayoffSpots: 0,
		},
	],
};

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

describe("the Play menu in a World's playoffs", () => {
	beforeAll(
		async () => {
			(globalThis as any).process.on(
				"unhandledRejection",
				onUnhandledRejection,
			);

			// getTeamsDefault only has 30, so cycle it to fill every Division
			const defaults = helpers.getTeamsDefault();
			const numClubs =
				structure.competitionDivisions.length * CLUBS_PER_DIVISION;
			const teamsFromInput = helpers.addPopRank(
				Array.from({ length: numClubs }, (_, i) => {
					const base = defaults[i % defaults.length]!;
					return {
						...base,
						tid: i,
						abbrev: `T${i}`,
						region: `${base.region} ${Math.floor(i / defaults.length)}`,
						divisionId:
							structure.competitionDivisions[
								Math.floor(i / CLUBS_PER_DIVISION)
							]!.divisionId,
					};
				}),
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
				season: STARTING_SEASON,
				phase: PHASE.PLAYOFFS,
			};
			local.autoPlayUntil = { ...target, start: Date.now() };
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

	test("plays the Champions League, with no promotion playoffs to count", async () => {
		// What the UI does between the regular season ending and the user
		// pressing a play button
		await idb.cache.flush();

		const gameAttributes = g as unknown as Partial<GameAttributesLeague>;

		// The Champions League has a matchday waiting
		const scheduled = gameAttributes.championsLeagueState?.scheduledGames ?? [];
		expect(scheduled.length).toBeGreaterThan(0);

		// ...and the promotion playoffs have nothing to play, so they're worth no
		// days at all - the case that used to leave the Champions League unplayed
		const promotionPlayoffDays = (
			gameAttributes.promotionPlayoffState?.links ?? []
		).reduce(
			(total, link) =>
				total + link.entrants.length - link.numSpots - link.games.length,
			0,
		);
		expect(promotionPlayoffDays).toBe(0);

		await playMenu.day(undefined, {} as any);

		// The matchday was played, rather than the phase stalling
		expect(gameAttributes.championsLeagueResults?.length ?? 0).toBe(
			scheduled.length,
		);
	});
});
