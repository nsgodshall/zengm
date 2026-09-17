import { competition } from "../worker/core/index.ts";
import {
	analyzeStoryYield,
	STORY_YIELD_SETTINGS,
	type StoryYield,
} from "../worker/core/competition/storyYield.ts";
import { idb } from "../worker/db/index.ts";

// International Soccer Zen GM mod (storytelling): the long run's story yield
// report (see STORY_TELLING_PLAN.md, Phase 0), kept out of worldLongRun.test.ts
// so it reads on its own

export const getStoryYieldReport = async () => {
	const structure = competition.getCompetitionStructure();
	const countryIdByDivisionId = new Map(
		structure.competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);
	const clubs = (await idb.cache.teams.getAll())
		.filter((t) => !t.disabled && t.divisionId !== undefined)
		.map((t) => ({
			tid: t.tid,
			name: `${t.region} ${t.name}`,
			countryId: countryIdByDivisionId.get(t.divisionId!)!,
			history: t.worldHistory ?? [],
		}));

	return {
		settings: STORY_YIELD_SETTINGS,
		storyYield: analyzeStoryYield({
			countries: structure.countries,
			clubs,
		}),
		clubs,
	};
};

const percent = (value: number | undefined) =>
	value === undefined ? "-" : `${Math.round(100 * value)}%`;
const oneDecimal = (value: number | undefined) =>
	value === undefined ? "-" : String(Math.round(10 * value) / 10);
const spans = (rows: { name: string; from: number; to: number }[]) =>
	rows.length === 0
		? "none"
		: rows.map((row) => `${row.name} (${row.from}–${row.to})`).join("; ");
const seasons = (rows: { name: string; season: number }[]) =>
	rows.length === 0
		? "none"
		: rows.map((row) => `${row.name} (${row.season})`).join("; ");

export const formatStoryYield = (storyYield: StoryYield[]) => {
	const lines = [
		"# Stories",
		"",
		"Measured against STORY_TELLING_PLAN.md's Phase 6a targets for real-league concentration. Big clubs are each season's 3 clubs with the best average place in their Country's pyramid over the 5 seasons before.",
		"",
	];

	const mean = (values: (number | undefined)[]) => {
		const defined = values.filter((value) => value !== undefined);
		return defined.length === 0
			? undefined
			: defined.reduce((sum, value) => sum + value, 0) / defined.length;
	};
	lines.push(
		"## All Countries",
		"",
		"| Measure | This World | Target |",
		"| --- | --- | --- |",
		`| Distinct top-tier champions per 10 seasons | ${oneDecimal(mean(storyYield.map((row) => row.topTier.distinctChampions.mean)))} | 2–5, typically 3 |`,
		`| Most titles by one club per 10 seasons | ${oneDecimal(mean(storyYield.map((row) => row.topTier.mostTitlesByOneClub.mean)))} | 4–7 |`,
		`| Longest title run | ${Math.max(0, ...storyYield.map((row) => row.topTier.longestTitleRun?.titles ?? 0))} | 5+ in some Country over 20 seasons |`,
		`| Seasons with 2+ big clubs in the top four | ${percent(mean(storyYield.map((row) => row.topTier.bigClubs.shareWithTwoInTopFour)))} | most seasons |`,
		`| Titles won by a big club | ${percent(mean(storyYield.map((row) => row.topTier.bigClubs.shareOfTitles)))} | most |`,
		`| Challenger titles | ${storyYield.reduce((sum, row) => sum + row.topTier.bigClubs.challengerTitles.length, 0)} | 1–2 per Country per 20 seasons |`,
		`| Big clubs relegated | ${storyYield.reduce((sum, row) => sum + row.topTier.bigClubs.giantsRelegated.length, 0)} | about 1 per Country per 20–40 seasons |`,
		`| Promoted to a top tier, straight back down | ${percent(mean(storyYield.map((row) => row.movement.promotedToTopStraightDown)))} | 30–47% |`,
		`| Relegated from a top tier, straight back up | ${percent(mean(storyYield.map((row) => row.movement.relegatedFromTopStraightBack)))} | 27–40% |`,
		"",
	);

	for (const row of storyYield) {
		const { topTier, movement } = row;
		lines.push(
			`## ${row.country} (${row.seasons} seasons)`,
			"",
			"| Measure | Value |",
			"| --- | --- |",
			`| Distinct champions per ${topTier.windowSeasons} seasons (mean, min–max) | ${oneDecimal(topTier.distinctChampions.mean)} (${topTier.distinctChampions.min}–${topTier.distinctChampions.max}) |`,
			`| Most titles by one club per ${topTier.windowSeasons} seasons (mean, max) | ${oneDecimal(topTier.mostTitlesByOneClub.mean)} (${topTier.mostTitlesByOneClub.max}) |`,
			`| Longest title run | ${topTier.longestTitleRun ? `${topTier.longestTitleRun.name}, ${topTier.longestTitleRun.titles} (${topTier.longestTitleRun.from}–${topTier.longestTitleRun.to})` : "none"} |`,
			`| First titles after the first season | ${topTier.numFirstTitles} |`,
			`| Seasons with 2+ big clubs in the top four | ${percent(topTier.bigClubs.shareWithTwoInTopFour)} of ${topTier.bigClubs.seasons} |`,
			`| Titles won by a big club | ${percent(topTier.bigClubs.shareOfTitles)} |`,
			`| Biggest club, first and last ${STORY_YIELD_SETTINGS.bigClubLookback} seasons | ${topTier.bigClubs.biggestAtStart ?? "-"}, ${topTier.bigClubs.biggestAtEnd ?? "-"} |`,
			`| Promoted to the top tier, straight back down | ${percent(movement.promotedToTopStraightDown)} of ${movement.promotedToTop} |`,
			`| Relegated from the top tier, straight back up | ${percent(movement.relegatedFromTopStraightBack)} of ${movement.relegatedFromTop} |`,
			`| Clubs never out of the top tier | ${movement.numNeverLeftTopTier} |`,
			`| Lower tiers: distinct champions per season | ${Object.entries(
				row.lowerTierDistinctChampionShare,
			)
				.map(([tier, share]) => `tier ${tier} ${percent(share)}`)
				.join(", ")} |`,
			"",
			`- Champions: ${topTier.champions.join("; ")}`,
			`- Dynasties: ${
				topTier.dynasties.length === 0
					? "none"
					: topTier.dynasties
							.map(
								(dynasty) =>
									`${dynasty.name}, ${dynasty.titles} titles (${dynasty.from}–${dynasty.to})`,
							)
							.join("; ")
			}`,
			`- Challenger titles: ${seasons(topTier.bigClubs.challengerTitles)}`,
			`- Big clubs relegated: ${seasons(topTier.bigClubs.giantsRelegated)}`,
			`- Climbs of ${STORY_YIELD_SETTINGS.climbTiers}+ tiers in ${STORY_YIELD_SETTINGS.climbSeasons} seasons: ${
				movement.climbs.length === 0
					? "none"
					: movement.climbs
							.map(
								(climb) =>
									`${climb.name}, tier ${climb.fromTier} to ${climb.toTier} (${climb.from}–${climb.to})`,
							)
							.join("; ")
			}`,
			`- From the bottom tier to the top: ${spans(movement.bottomToTop)}`,
			`- Yo-yo clubs: ${spans(movement.yoYos)}`,
			"",
		);
	}

	return lines.join("\n");
};
