import type { WorldHistoryEntry } from "../../../common/types.ts";
import { getDynasties } from "./clubHonours.ts";

// International Soccer Zen GM mod (storytelling): how many of the stories real
// leagues are made of a World's history produced, measured from its clubs'
// saved histories, for the long run's report (see STORY_TELLING_PLAN.md, Phase
// 0, and Phase 6a's targets)

export const STORY_YIELD_SETTINGS = {
	// Titles are counted in every run of this many seasons
	windowSeasons: 10,
	// A Country's big clubs in a season are the ones with the best average place
	// in its pyramid over this many seasons before it
	bigClubLookback: 5,
	numBigClubs: 3,
	// A climb is this many tiers up within this many seasons
	climbTiers: 2,
	climbSeasons: 5,
	// A yo-yo club goes up and down this many times each within this many seasons
	yoYoMoves: 3,
	yoYoSeasons: 10,
};

export type StoryYieldClub = {
	tid: number;
	name: string;
	countryId: number;
	history: WorldHistoryEntry[];
};

type Span = { name: string; from: number; to: number };

const mean = (values: number[]) =>
	values.length === 0
		? undefined
		: values.reduce((sum, value) => sum + value, 0) / values.length;

// Every run of `size` consecutive seasons, or all of them if there are fewer
const getWindows = (seasons: number[], size: number) => {
	if (seasons.length <= size) {
		return [seasons];
	}
	const windows = [];
	for (let i = 0; i + size <= seasons.length; i++) {
		windows.push(seasons.slice(i, i + size));
	}
	return windows;
};

const analyzeCountry = (
	country: { countryId: number; name: string },
	clubs: StoryYieldClub[],
) => {
	const settings = STORY_YIELD_SETTINGS;
	const nameByTid = new Map(clubs.map((club) => [club.tid, club.name]));
	const name = (tid: number) => nameByTid.get(tid) ?? `tid ${tid}`;

	const entriesBySeason = new Map<number, Map<number, WorldHistoryEntry>>();
	for (const club of clubs) {
		for (const entry of club.history) {
			let entries = entriesBySeason.get(entry.season);
			if (!entries) {
				entries = new Map();
				entriesBySeason.set(entry.season, entries);
			}
			entries.set(club.tid, entry);
		}
	}
	const seasons = [...entriesBySeason.keys()].sort((a, b) => a - b);
	const tiers = [
		...new Set(clubs.flatMap((club) => club.history.map((e) => e.tier))),
	].sort((a, b) => a - b);
	const topTier = tiers[0] ?? 1;
	const bottomTier = tiers.at(-1) ?? 1;

	const championsByTier = new Map<number, Map<number, number>>();
	for (const [season, entries] of entriesBySeason) {
		for (const [tid, entry] of entries) {
			if (entry.champion) {
				let champions = championsByTier.get(entry.tier);
				if (!champions) {
					champions = new Map();
					championsByTier.set(entry.tier, champions);
				}
				champions.set(season, tid);
			}
		}
	}
	const topChampions = championsByTier.get(topTier) ?? new Map();

	// Title concentration in every run of windowSeasons seasons
	const windows = getWindows(seasons, settings.windowSeasons).map(
		(windowSeasons) => {
			const titlesByTid = new Map<number, number>();
			for (const season of windowSeasons) {
				const tid = topChampions.get(season);
				if (tid !== undefined) {
					titlesByTid.set(tid, (titlesByTid.get(tid) ?? 0) + 1);
				}
			}
			return {
				distinctChampions: titlesByTid.size,
				mostTitles: Math.max(0, ...titlesByTid.values()),
			};
		},
	);

	// Title runs and dynasties
	let longestTitleRun: (Span & { titles: number }) | undefined;
	let run: (Span & { tid: number; titles: number }) | undefined;
	for (const season of seasons) {
		const tid = topChampions.get(season);
		if (run && tid !== undefined && run.tid === tid && run.to === season - 1) {
			run.to = season;
			run.titles += 1;
		} else {
			run =
				tid === undefined
					? undefined
					: { tid, name: name(tid), from: season, to: season, titles: 1 };
		}
		if (run && (!longestTitleRun || run.titles > longestTitleRun.titles)) {
			longestTitleRun = {
				name: run.name,
				from: run.from,
				to: run.to,
				titles: run.titles,
			};
		}
	}

	const dynasties = clubs
		.flatMap((club) =>
			getDynasties(
				[...topChampions]
					.filter(([, tid]) => tid === club.tid)
					.map(([season]) => season),
			).map((dynasty) => ({ name: club.name, ...dynasty })),
		)
		.sort((a, b) => a.from - b.from);

	// First titles, after the first season
	let numFirstTitles = 0;
	const hasWon = new Set<number>();
	for (const [i, season] of seasons.entries()) {
		const tid = topChampions.get(season);
		if (tid === undefined) {
			continue;
		}
		if (i > 0 && !hasWon.has(tid)) {
			numFirstTitles += 1;
		}
		hasWon.add(tid);
	}

	// Big clubs: the best average place in the pyramid over the seasons before
	const bigClubSeasons = [];
	const giantsRelegated: { name: string; season: number }[] = [];
	const challengerTitles: { name: string; season: number }[] = [];
	for (let i = settings.bigClubLookback; i < seasons.length; i++) {
		const season = seasons[i]!;
		const lookback = seasons.slice(i - settings.bigClubLookback, i);
		const bigTids = clubs
			.map((club) => ({
				tid: club.tid,
				place: mean(
					lookback
						.map(
							(other) =>
								entriesBySeason.get(other)?.get(club.tid)?.pyramidPosition,
						)
						.filter((place) => place !== undefined),
				),
			}))
			.filter(
				(row): row is { tid: number; place: number } => row.place !== undefined,
			)
			.sort((a, b) => a.place - b.place || a.tid - b.tid)
			.slice(0, settings.numBigClubs)
			.map((row) => row.tid);

		const entries = entriesBySeason.get(season)!;
		const bigEntries = bigTids
			.map((tid) => entries.get(tid))
			.filter((entry) => entry !== undefined);
		const championTid = topChampions.get(season);
		bigClubSeasons.push({
			numInTopFour: bigEntries.filter(
				(entry) => entry.tier === topTier && entry.position <= 4,
			).length,
			bigClubChampion:
				championTid !== undefined && bigTids.includes(championTid),
		});
		if (championTid !== undefined && !bigTids.includes(championTid)) {
			challengerTitles.push({ name: name(championTid), season });
		}
		for (const tid of bigTids) {
			if (entries.get(tid)?.moved === "relegated") {
				giantsRelegated.push({ name: name(tid), season });
			}
		}
	}

	// Who was biggest at the start and at the end
	const biggestOver = (range: number[]) =>
		clubs
			.map((club) => ({
				name: club.name,
				place: mean(
					range
						.map(
							(season) =>
								club.history.find((entry) => entry.season === season)
									?.pyramidPosition,
						)
						.filter((place) => place !== undefined),
				),
			}))
			.filter((row) => row.place !== undefined)
			.sort((a, b) => a.place! - b.place!)[0]?.name;
	const biggestAtStart = biggestOver(
		seasons.slice(0, settings.bigClubLookback),
	);
	const biggestAtEnd = biggestOver(seasons.slice(-settings.bigClubLookback));

	// Rises and falls
	const climbs: (Span & { fromTier: number; toTier: number })[] = [];
	const bottomToTop: Span[] = [];
	const yoYos: Span[] = [];
	let numNeverLeftTopTier = 0;
	let promotedToTop = 0;
	let promotedToTopStraightDown = 0;
	let relegatedFromTop = 0;
	let relegatedFromTopStraightBack = 0;
	for (const club of clubs) {
		const history = [...club.history].sort((a, b) => a.season - b.season);

		const climb = history.flatMap((from, i) =>
			history
				.slice(i + 1)
				.filter(
					(to) =>
						to.season - from.season <= settings.climbSeasons &&
						from.tier - to.tier >= settings.climbTiers,
				)
				.map((to) => ({
					name: club.name,
					from: from.season,
					to: to.season,
					fromTier: from.tier,
					toTier: to.tier,
				})),
		)[0];
		if (climb) {
			climbs.push(climb);
		}

		// Only a Country with a tier below the second has a real bottom to climb
		// from; in a two-tier Country that would just be promotion
		const firstBottom = history.find((entry) => entry.tier === bottomTier);
		const topAfter =
			bottomTier - topTier >= settings.climbTiers && firstBottom
				? history.find(
						(entry) =>
							entry.season > firstBottom.season && entry.tier === topTier,
					)
				: undefined;
		if (firstBottom && topAfter) {
			bottomToTop.push({
				name: club.name,
				from: firstBottom.season,
				to: topAfter.season,
			});
		}

		const moveSeasons = (moved: "promoted" | "relegated") =>
			history.filter((entry) => entry.moved === moved).map((e) => e.season);
		const ups = moveSeasons("promoted");
		const downs = moveSeasons("relegated");
		const yoYo = history
			.map((entry) => entry.season)
			.map((from) => ({
				from,
				to: from + settings.yoYoSeasons - 1,
			}))
			.find(
				({ from, to }) =>
					ups.filter((season) => season >= from && season <= to).length >=
						settings.yoYoMoves &&
					downs.filter((season) => season >= from && season <= to).length >=
						settings.yoYoMoves,
			);
		if (yoYo) {
			yoYos.push({ name: club.name, ...yoYo });
		}

		if (
			history.length > 0 &&
			history.every((entry) => entry.tier === topTier)
		) {
			numNeverLeftTopTier += 1;
		}

		for (const [i, entry] of history.entries()) {
			const next = history[i + 1];
			if (!next || next.season !== entry.season + 1) {
				continue;
			}
			if (entry.moved === "promoted" && next.tier === topTier) {
				promotedToTop += 1;
				if (next.moved === "relegated") {
					promotedToTopStraightDown += 1;
				}
			}
			if (entry.moved === "relegated" && entry.tier === topTier) {
				relegatedFromTop += 1;
				if (next.moved === "promoted") {
					relegatedFromTopStraightBack += 1;
				}
			}
		}
	}

	const share = (count: number, total: number) =>
		total === 0 ? undefined : count / total;

	return {
		country: country.name,
		seasons: seasons.length,
		topTier: {
			champions: seasons.map((season) => {
				const tid = topChampions.get(season);
				return tid === undefined ? "-" : name(tid);
			}),
			windowSeasons: Math.min(settings.windowSeasons, seasons.length),
			distinctChampions: {
				mean: mean(windows.map((w) => w.distinctChampions)),
				min: Math.min(...windows.map((w) => w.distinctChampions)),
				max: Math.max(...windows.map((w) => w.distinctChampions)),
			},
			mostTitlesByOneClub: {
				mean: mean(windows.map((w) => w.mostTitles)),
				max: Math.max(...windows.map((w) => w.mostTitles)),
			},
			longestTitleRun,
			dynasties,
			numFirstTitles,
			bigClubs: {
				seasons: bigClubSeasons.length,
				shareWithTwoInTopFour: share(
					bigClubSeasons.filter((row) => row.numInTopFour >= 2).length,
					bigClubSeasons.length,
				),
				shareOfTitles: share(
					bigClubSeasons.filter((row) => row.bigClubChampion).length,
					bigClubSeasons.length,
				),
				challengerTitles,
				giantsRelegated,
				biggestAtStart,
				biggestAtEnd,
			},
		},
		lowerTierDistinctChampionShare: Object.fromEntries(
			tiers
				.filter((tier) => tier !== topTier)
				.map((tier) => {
					const champions = championsByTier.get(tier) ?? new Map();
					return [
						tier,
						share(new Set(champions.values()).size, champions.size),
					];
				}),
		),
		movement: {
			climbs,
			bottomToTop,
			yoYos,
			numNeverLeftTopTier,
			promotedToTop,
			promotedToTopStraightDown: share(
				promotedToTopStraightDown,
				promotedToTop,
			),
			relegatedFromTop,
			relegatedFromTopStraightBack: share(
				relegatedFromTopStraightBack,
				relegatedFromTop,
			),
		},
	};
};

export type StoryYield = ReturnType<typeof analyzeCountry>;

/** Story yield for each Country, from every club's saved history */
export const analyzeStoryYield = ({
	countries,
	clubs,
}: {
	countries: { countryId: number; name: string }[];
	clubs: StoryYieldClub[];
}): StoryYield[] =>
	countries.map((country) =>
		analyzeCountry(
			country,
			clubs.filter((club) => club.countryId === country.countryId),
		),
	);
