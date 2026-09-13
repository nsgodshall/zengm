import { assert, describe, expect, test } from "vitest";
import { helpers } from "../../util/index.ts";
import createGameAttributes from "./createGameAttributes.ts";
import { PHASE } from "../../../common/constants.ts";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import { unwrapGameAttribute } from "../../../common/unwrapGameAttribute.ts";
import {
	type CompetitionStructure,
	DEFAULT_DIVISION_ID,
	getDefaultCompetitionStructure,
} from "../competition/competitionStructure.ts";

test("save integer in wrapped format", async () => {
	const gameAttributes = await createGameAttributes({
		startingSeason: 2015,
		gameAttributesInput: {},
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
	});

	assert.deepStrictEqual(gameAttributes.userTid, [
		{ start: -Infinity, value: 5 },
	]);
});

test("maintain history", async () => {
	const gameAttributes = await createGameAttributes({
		startingSeason: 2015,
		gameAttributesInput: {
			startingSeason: 2010,
			userTid: [
				{ start: -Infinity, value: 3 },
				{ start: 2013, value: 5 },
			],
		},
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
	});

	assert.deepStrictEqual(gameAttributes.userTid, [
		{ start: -Infinity, value: 3 },
		{ start: 2013, value: 5 },
	]);
});

test("maintain history while selecting a new team", async () => {
	const gameAttributes = await createGameAttributes({
		startingSeason: 2015,
		gameAttributesInput: {
			startingSeason: 2010,
			userTid: [
				{ start: -Infinity, value: 3 },
				{ start: 2013, value: 4 },
			],
		},
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
	});

	assert.deepStrictEqual(gameAttributes.userTid, [
		{ start: -Infinity, value: 3 },
		{ start: 2013, value: 4 },
		{ start: 2015, value: 5 },
	]);
});

test("maintain history while selecting a new team, overwriting current season", async () => {
	const gameAttributes = await createGameAttributes({
		startingSeason: 2015,
		gameAttributesInput: {
			startingSeason: 2010,
			userTid: [
				{ start: -Infinity, value: 3 },
				{ start: 2015, value: 5 },
			],
		},
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
	});

	assert.deepStrictEqual(gameAttributes.userTid, [
		{ start: -Infinity, value: 3 },
		{ start: 2015, value: 5 },
	]);
});

test("new team after playoffs", async () => {
	const gameAttributes = await createGameAttributes({
		startingSeason: 2015,
		gameAttributesInput: {
			startingSeason: 2010,
			phase: PHASE.DRAFT,
			userTid: [
				{ start: -Infinity, value: 3 },
				{ start: 2015, value: 4 },
			],
		},
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
	});

	assert.deepStrictEqual(gameAttributes.userTid, [
		{ start: -Infinity, value: 3 },
		{ start: 2015, value: 4 },
		{ start: 2016, value: 5 },
	]);
});

describe("tiebreakers", () => {
	const defaultArgs = {
		teamInfos: helpers.getTeamsDefault(),
		userTid: 5,
		gameAttributesInput: {},
	};

	test("apply new default to an empty league file", async () => {
		const gameAttributes = await createGameAttributes({
			...defaultArgs,
			startingSeason: 2021,
		});

		assert.deepStrictEqual(
			gameAttributes.tiebreakers,
			defaultGameAttributes.tiebreakers,
		);
	});

	test("apply new default to an old version league file with no gameAttributes", async () => {
		const gameAttributes = await createGameAttributes({
			...defaultArgs,
			version: 40,
			startingSeason: 2021,
		});

		assert.deepStrictEqual(
			gameAttributes.tiebreakers,
			defaultGameAttributes.tiebreakers,
		);
	});

	describe("apply new default to an old version league file, only for upcoming season", () => {
		test("during regular season", async () => {
			const gameAttributes = await createGameAttributes({
				...defaultArgs,
				version: 40,
				startingSeason: 2021,
				gameAttributesInput: {
					season: 2023,
					phase: PHASE.REGULAR_SEASON,
				},
			});

			assert.deepStrictEqual(gameAttributes.tiebreakers[0].start, -Infinity);
			assert.deepStrictEqual(gameAttributes.tiebreakers[0].value, ["coinFlip"]);
			assert.deepStrictEqual(gameAttributes.tiebreakers[1]!.start, 2023);
			assert.deepStrictEqual(
				gameAttributes.tiebreakers[1]!.value,
				defaultGameAttributes.tiebreakers[0].value,
			);
		});

		test("after regular season", async () => {
			const gameAttributes = await createGameAttributes({
				...defaultArgs,
				version: 40,
				startingSeason: 2021,
				gameAttributesInput: {
					season: 2023,
					phase: PHASE.DRAFT_LOTTERY,
				},
			});

			assert.deepStrictEqual(gameAttributes.tiebreakers[0].start, -Infinity);
			assert.deepStrictEqual(gameAttributes.tiebreakers[0].value, ["coinFlip"]);
			assert.deepStrictEqual(gameAttributes.tiebreakers[1]!.start, 2024);
			assert.deepStrictEqual(
				gameAttributes.tiebreakers[1]!.value,
				defaultGameAttributes.tiebreakers[0].value,
			);
		});

		test("during expansion draft after season", async () => {
			const gameAttributes = await createGameAttributes({
				...defaultArgs,
				version: 40,
				startingSeason: 2021,
				gameAttributesInput: {
					season: 2023,
					phase: PHASE.EXPANSION_DRAFT,
					nextPhase: PHASE.DRAFT_LOTTERY,
				},
			});

			assert.deepStrictEqual(gameAttributes.tiebreakers[0].start, -Infinity);
			assert.deepStrictEqual(gameAttributes.tiebreakers[0].value, ["coinFlip"]);
			assert.deepStrictEqual(gameAttributes.tiebreakers[1]!.start, 2024);
			assert.deepStrictEqual(
				gameAttributes.tiebreakers[1]!.value,
				defaultGameAttributes.tiebreakers[0].value,
			);
		});
	});

	test("do nothing to new version league file", async () => {
		const gameAttributes = await createGameAttributes({
			...defaultArgs,
			version: 43,
			startingSeason: 2021,
			gameAttributesInput: {
				tiebreakers: "foo" as any,
			},
		});

		assert.deepStrictEqual(gameAttributes.tiebreakers as any, "foo");
	});
});

describe("competition structure", () => {
	const pilot: CompetitionStructure = {
		countries: [
			{ countryId: 10, name: "Northland" },
			{ countryId: 20, name: "Southland" },
		],
		competitionDivisions: [
			{ divisionId: 1, countryId: 10, tier: 1, name: "Northland 1" },
			{ divisionId: 2, countryId: 10, tier: 2, name: "Northland 2" },
			{ divisionId: 3, countryId: 20, tier: 1, name: "Southland 1" },
			{ divisionId: 4, countryId: 20, tier: 2, name: "Southland 2" },
		],
		promotionRelegationLinks: [
			{
				id: 1,
				countryId: 10,
				upperDivisionId: 1,
				lowerDivisionId: 2,
				numAutoPromoted: 1,
				numAutoRelegated: 1,
				numPromotionPlayoffTeams: 0,
				numPromotionPlayoffSpots: 0,
			},
			{
				id: 2,
				countryId: 20,
				upperDivisionId: 3,
				lowerDivisionId: 4,
				numAutoPromoted: 1,
				numAutoRelegated: 1,
				numPromotionPlayoffTeams: 0,
				numPromotionPlayoffSpots: 0,
			},
		],
	};

	// All 30 default teams, split 8/8/8/6 across the pilot's Divisions in order.
	// Fewer teams makes createGameAttributes trim the playoffs, which reads g,
	// and g isn't loaded in these tests.
	const getPilotTeamInfos = () =>
		helpers.getTeamsDefault().map((t, i) => ({
			...t,
			divisionId: pilot.competitionDivisions[Math.floor(i / 8)]!.divisionId,
		}));

	test("a league with no structure gets the default one, with every team in it", async () => {
		const teamInfos = helpers.getTeamsDefault();
		const gameAttributes = await createGameAttributes({
			startingSeason: 2021,
			gameAttributesInput: {},
			teamInfos,
			userTid: 5,
		});

		const defaultStructure = getDefaultCompetitionStructure();
		assert.deepStrictEqual(
			gameAttributes.countries,
			defaultStructure.countries,
		);
		assert.deepStrictEqual(
			gameAttributes.competitionDivisions,
			defaultStructure.competitionDivisions,
		);
		assert.deepStrictEqual(gameAttributes.promotionRelegationLinks, []);
		for (const t of teamInfos) {
			assert.strictEqual(t.divisionId, DEFAULT_DIVISION_ID);
		}

		// A single-Division league keeps its own confs/divs
		assert.deepStrictEqual(gameAttributes.confs, defaultGameAttributes.confs);
		assert.deepStrictEqual(gameAttributes.divs, defaultGameAttributes.divs);
	});

	test("a multi-Division World sets confs/divs and each team's cid/did from the structure", async () => {
		const teamInfos = getPilotTeamInfos();
		const gameAttributes = await createGameAttributes({
			startingSeason: 2021,
			gameAttributesInput: { ...pilot },
			teamInfos,
			userTid: 0,
		});

		assert.deepStrictEqual(
			gameAttributes.competitionDivisions,
			pilot.competitionDivisions,
		);
		assert.deepStrictEqual(
			gameAttributes.promotionRelegationLinks,
			pilot.promotionRelegationLinks,
		);

		// ZenGM's own playoffs are off - each Division crowns its table winner
		assert.deepStrictEqual(
			unwrapGameAttribute(gameAttributes, "numGamesPlayoffSeries"),
			[],
		);
		assert.strictEqual(gameAttributes.playIn, false);

		// No draft or salary cap either - transfers and wage budgets instead
		assert.strictEqual(gameAttributes.draftType, "freeAgents");
		assert.strictEqual(gameAttributes.salaryCapType, "none");
		assert.deepStrictEqual(
			unwrapGameAttribute(gameAttributes, "confs").map((conf) => conf.name),
			["Northland", "Southland"],
		);
		assert.deepStrictEqual(
			unwrapGameAttribute(gameAttributes, "divs").map((div) => [
				div.cid,
				div.did,
				div.name,
			]),
			[
				[0, 0, "Northland 1"],
				[0, 1, "Northland 2"],
				[1, 2, "Southland 1"],
				[1, 3, "Southland 2"],
			],
		);

		for (const [i, t] of teamInfos.entries()) {
			const did = Math.floor(i / 8);
			assert.strictEqual(t.divisionId, did + 1);
			assert.strictEqual(t.did, did);
			assert.strictEqual(t.cid, did < 2 ? 0 : 1);
		}
	});

	test("rejects a World with a team in a Division that doesn't exist", async () => {
		const teamInfos = getPilotTeamInfos();
		teamInfos[3]!.divisionId = 99;

		await expect(
			createGameAttributes({
				startingSeason: 2021,
				gameAttributesInput: { ...pilot },
				teamInfos,
				userTid: 0,
			}),
		).rejects.toThrow(/has divisionId 99, which doesn't exist/);
	});
});
