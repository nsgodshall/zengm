import type { Options } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import {
	buildSeasonReviewPrompt,
	checkSeasonReview,
	describeReviewProblem,
	type SeasonReviewFacts,
	SEASON_REVIEW_SETTINGS,
} from "./seasonReview.ts";
import { getWorldChronicle } from "./worldChronicle.ts";

// International Soccer Zen GM mod (storytelling, Phase 7): asking a language
// model for a season review and keeping what it says. Decided with the user:
// the user brings their own API key, nothing is generated without them asking,
// and a review is written once and then kept in the save, so a season doesn't
// read differently every time it's opened.

export const SEASON_REVIEW_KIND = "seasonReview";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/** The review already written for a Country's season, if there is one */
export const getSeasonReview = async (season: number, countryId: number) => {
	const events = await idb.getCopies.events({ season }, "noCopyCache");
	const event = events.find(
		(event) =>
			event.type === "story" &&
			"story" in event &&
			event.story?.kind === SEASON_REVIEW_KIND &&
			event.story.countryId === countryId,
	);
	return event?.text;
};

/** The facts a Country's season is written from (see seasonReview.ts) */
export const getSeasonReviewFacts = async (
	season: number,
	countryId: number,
): Promise<SeasonReviewFacts | undefined> => {
	const chronicle = await getWorldChronicle(season);
	const country = chronicle?.countries.find(
		(country) => country.countryId === countryId,
	);
	if (!chronicle?.hasSeason || !country) {
		return;
	}

	const name = (club: { region: string; name: string }) =>
		`${club.region} ${club.name}`.trim();

	return {
		season,
		country: country.name,
		divisions: country.divisions.map((division) => ({
			name: division.name,
			tier: division.tier,
			...(division.champion
				? {
						champion: {
							name: name(division.champion),
							points: division.champion.points,
						},
					}
				: {}),
			promoted: division.promoted.map(name),
			relegated: division.relegated.map(name),
		})),
		// The rendered story text carries its own facts, and the links in it
		// would only confuse a model
		stories: country.stories.map((story) => ({
			kind: story.kind,
			text: story.text.replaceAll(/<[^>]*>/g, ""),
		})),
	};
};

const getLlmOptions = async () => {
	const store = (await idb.meta.transaction("attributes")).store;
	const options = ((await store.get("options")) ?? {}) as Options;
	return {
		apiKey: options.llmApiKey?.trim(),
		baseUrl: options.llmBaseUrl?.trim() || DEFAULT_BASE_URL,
		model: options.llmModel?.trim() || DEFAULT_MODEL,
	};
};

/** Whether a review can be asked for at all, for the UI to decide what to show */
export const canWriteSeasonReview = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return false;
	}
	const { apiKey } = await getLlmOptions();
	return apiKey !== undefined && apiKey.length > 0;
};

const ask = async ({
	system,
	user,
	apiKey,
	baseUrl,
	model,
}: {
	system: string;
	user: string;
	apiKey: string;
	baseUrl: string;
	model: string;
}) => {
	let response;
	try {
		response = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			// So a model that never answers doesn't leave the page waiting forever
			signal: AbortSignal.timeout(SEASON_REVIEW_SETTINGS.timeoutMs),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				temperature: SEASON_REVIEW_SETTINGS.temperature,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
			}),
		});
	} catch (error) {
		// "Failed to fetch" on its own tells the user nothing about which address
		// didn't answer, or that a browser extension might be blocking it
		throw new Error(
			`Couldn't reach ${baseUrl}: ${(error as Error).message}. Check the API base URL in Global Settings, and that nothing is blocking the request.`,
		);
	}

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`The model's API said ${response.status}: ${body.slice(0, 200)}`,
		);
	}

	const data = await response.json();
	const text = data?.choices?.[0]?.message?.content;
	if (typeof text !== "string") {
		throw new Error("The model's API sent back no text");
	}
	return text.trim();
};

/**
 * Write a Country's season review, unless one is already written. Throws with
 * something to show the user when there's no API key, when the request fails,
 * or when what came back doesn't hold up (see checkSeasonReview) - a made-up
 * review is worse than none, since the Chronicle is meant to be the record.
 */
export const writeSeasonReview = async ({
	season,
	countryId,
}: {
	season: number;
	countryId: number;
}) => {
	const existing = await getSeasonReview(season, countryId);
	if (existing !== undefined) {
		return existing;
	}

	const { apiKey, baseUrl, model } = await getLlmOptions();
	if (!apiKey) {
		throw new Error(
			"Add an API key under Tools > Global Settings to have season reviews written.",
		);
	}

	const facts = await getSeasonReviewFacts(season, countryId);
	if (!facts) {
		throw new Error(`${season} hasn't been played yet.`);
	}

	const { system, user } = buildSeasonReviewPrompt(facts);
	const text = await ask({ system, user, apiKey, baseUrl, model });

	const problems = checkSeasonReview({
		text,
		facts,
		earliestSeason: g.get("startingSeason"),
	});
	if (problems.length > 0) {
		throw new Error(
			`The review it wrote didn't hold up, so it wasn't kept: ${problems
				.map(describeReviewProblem)
				.join("; ")}. Try again.`,
		);
	}

	await idb.cache.events.add({
		type: "story",
		text,
		pids: [],
		tids: [],
		season,
		// The Chronicle shows it; it isn't news
		score: 0,
		story: {
			kind: SEASON_REVIEW_KIND,
			countryId,
			significance: 0,
			facts: { model, words: text.trim().split(/\s+/).length },
		},
	});
	await idb.cache.flush();

	return text;
};

/** Throw away a Country's season review, so it can be asked for again */
export const deleteSeasonReview = async (season: number, countryId: number) => {
	const events = await idb.getCopies.events({ season }, "noCopyCache");
	for (const event of events) {
		if (
			event.type === "story" &&
			"story" in event &&
			event.story?.kind === SEASON_REVIEW_KIND &&
			event.story.countryId === countryId
		) {
			await idb.cache.events.delete(event.eid);
		}
	}
	await idb.cache.flush();
};
