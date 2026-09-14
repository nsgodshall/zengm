import type { Country } from "../../../common/types.ts";
import type { CompetitionStructure } from "./competitionStructure.ts";
import {
	generateCrestSvg,
	getCrestDataUrl,
	pickCrestPattern,
} from "./crests.ts";
import { isRealClubName, type PilotTown } from "./pilotTowns.ts";
import {
	DEFAULT_WORLD_COUNTRY_KEYS,
	WORLD_COUNTRIES,
	type WorldCountry,
} from "./worldCountries.ts";
import { getStadiumCapacity } from "./worldSettings.ts";

// International Soccer Zen GM mod (Epic 7): a new World of real Countries with
// fictional clubs, created from the New League page

export const PILOT_CLUBS_PER_DIVISION = 16;
export const MIN_CLUBS_PER_DIVISION = 10;
export const MAX_CLUBS_PER_DIVISION = 20;

const TIER_NAMES = ["First", "Second", "Third", "Fourth", "Fifth"];

// Primary, secondary, and accent kit colors
const KIT_COLORS: [string, string, string][] = [
	["#c8102e", "#ffffff", "#000000"],
	["#034694", "#ffffff", "#dba111"],
	["#fdb913", "#231f20", "#ffffff"],
	["#6cabdd", "#ffffff", "#1c2c5b"],
	["#1b5e20", "#ffffff", "#fdd835"],
	["#7a263a", "#1bb1e7", "#ffffff"],
	["#000000", "#ffffff", "#c8102e"],
	["#ffffff", "#000000", "#c8102e"],
	["#ff6600", "#000000", "#ffffff"],
	["#5b2c83", "#ffffff", "#fdb913"],
	["#003399", "#ffcc00", "#ffffff"],
	["#e30613", "#003da5", "#ffffff"],
];

const pick = <T>(items: T[], random: () => number) =>
	items[Math.floor(random() * items.length)]!;

const shuffled = <T>(items: T[], random: () => number) => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
};

/**
 * `count` different towns from `pool`, biggest first, give or take. Bigger
 * towns are more likely to be picked (by the square root of their population),
 * and each town's population is jittered by up to 30% either way when they're
 * ordered, so the biggest towns lean towards the top tier without always
 * getting there.
 */
const chooseTowns = (
	pool: PilotTown[],
	count: number,
	random: () => number,
) => {
	if (pool.length < count) {
		throw new Error(`Only ${pool.length} towns for ${count} clubs`);
	}

	const remaining = [...pool];
	const chosen: { town: PilotTown; size: number }[] = [];
	while (chosen.length < count) {
		const weights = remaining.map((town) => Math.sqrt(town.pop));
		let r = random() * weights.reduce((sum, weight) => sum + weight, 0);
		let index = weights.findIndex((weight) => {
			r -= weight;
			return r < 0;
		});
		if (index < 0) {
			index = remaining.length - 1;
		}
		const [town] = remaining.splice(index, 1);
		chosen.push({ town: town!, size: town!.pop * (0.7 + 0.6 * random()) });
	}
	return chosen.sort((a, b) => b.size - a.size).map(({ town }) => town);
};

/**
 * A name for a club in `town`, from its Country's name patterns, that doesn't
 * copy a real club (see isRealClubName) or a club already in this World
 */
const nameClub = ({
	town,
	country,
	random,
	takenNames,
}: {
	town: PilotTown;
	country: WorldCountry;
	random: () => number;
	takenNames: Set<string>;
}) => {
	const clubTown = town.clubName ?? town.name;
	const fill = (text: string) => text.replaceAll("{town}", clubTown);
	const candidates = shuffled(country.namePatterns, random).map(
		([region, name]) => ({ region: fill(region), name: fill(name) }),
	);

	const club =
		candidates.find(({ region, name }) => {
			const fullName = `${region} ${name}`;
			return (
				!takenNames.has(fullName) &&
				!isRealClubName(fullName, country.realClubNames)
			);
		}) ?? candidates[0]!;
	takenNames.add(`${club.region} ${club.name}`);
	return club;
};

/**
 * A three letter abbreviation for a club from its town, different from every
 * abbreviation in `taken`: the first three letters, or failing that the first
 * letter and two later ones, or failing that the first two letters and a digit
 */
export const makeAbbrev = (town: string, taken: Set<string>) => {
	const letters = town
		.normalize("NFD")
		.replaceAll(/[^A-Za-z]/g, "")
		.toUpperCase();

	const candidates = [letters.slice(0, 3)];
	for (let i = 1; i < letters.length; i++) {
		for (let j = i + 1; j < letters.length; j++) {
			candidates.push(`${letters[0]}${letters[i]}${letters[j]}`);
		}
	}
	for (let digit = 1; digit <= 9; digit++) {
		candidates.push(`${letters.slice(0, 2)}${digit}`);
	}

	const abbrev =
		candidates.find((candidate) => !taken.has(candidate)) ??
		`${letters.slice(0, 1)}${taken.size}`;
	taken.add(abbrev);
	return abbrev;
};

/**
 * A club's market size, in millions like ZenGM's region populations, from its
 * tier and its place in its Division's pecking order (0 is the biggest). Higher
 * tiers are bigger, and the biggest few clubs much bigger than the rest, so
 * there are traditional big clubs for promotion and relegation stories.
 */
const getPop = ({
	tier,
	place,
	clubsPerDivision,
	marketFactor,
	random,
}: {
	tier: number;
	place: number;
	clubsPerDivision: number;
	marketFactor: number;
	random: () => number;
}) => {
	const size = (1 - place / (clubsPerDivision - 1)) ** 2;
	const [min, range] =
		tier === 1 ? [1.2, 6.8] : tier === 2 ? [0.5, 1.8] : [0.3, 0.9];
	return (
		Math.round(
			marketFactor * (min + range * size * (0.85 + 0.3 * random())) * 100,
		) / 100
	);
};

/**
 * A new World: the Countries in `countryKeys` (in WORLD_COUNTRIES order), each
 * with its tiers of `clubsPerDivision` clubs playing a double round robin. In
 * each Country the bottom 3 of a tier go down, and the top 2 of the tier below
 * go up along with the winner of a playoff among the next 4. Clubs are in real
 * towns (see pilotTowns.ts and worldTowns.ts), with invented names in their
 * Country's style, three letter abbreviations, kit colors, crests, and market
 * sizes. `random` is uniform on [0, 1), so the same numbers make the same World.
 */
export const generateWorld = ({
	countryKeys = DEFAULT_WORLD_COUNTRY_KEYS,
	clubsPerDivision = PILOT_CLUBS_PER_DIVISION,
	random = Math.random,
}: {
	countryKeys?: string[];
	clubsPerDivision?: number;
	random?: () => number;
} = {}) => {
	const worldCountries = WORLD_COUNTRIES.filter((country) =>
		countryKeys.includes(country.key),
	);
	if (worldCountries.length === 0) {
		throw new Error("A World needs at least one Country");
	}
	if (
		!Number.isInteger(clubsPerDivision) ||
		clubsPerDivision < MIN_CLUBS_PER_DIVISION ||
		clubsPerDivision > MAX_CLUBS_PER_DIVISION
	) {
		throw new Error(
			`A Division needs ${MIN_CLUBS_PER_DIVISION} to ${MAX_CLUBS_PER_DIVISION} clubs, not ${clubsPerDivision}`,
		);
	}
	const numGames = 2 * (clubsPerDivision - 1);

	const countries: Country[] = [];
	const competitionDivisions: CompetitionStructure["competitionDivisions"][number][] =
		[];
	const promotionRelegationLinks: CompetitionStructure["promotionRelegationLinks"] =
		[];
	for (const [countryId, country] of worldCountries.entries()) {
		countries.push({
			countryId,
			name: country.name,
			startingStrengthPenalty: country.startingStrengthPenalty,
		});
		for (let tier = 1; tier <= country.numTiers; tier++) {
			const divisionId = competitionDivisions.length + 1;
			competitionDivisions.push({
				divisionId,
				countryId,
				tier,
				name: `${country.adjective} ${TIER_NAMES[tier - 1]} Division`,
				numGames,
			});
			if (tier > 1) {
				promotionRelegationLinks.push({
					id: promotionRelegationLinks.length + 1,
					countryId,
					upperDivisionId: divisionId - 1,
					lowerDivisionId: divisionId,
					numAutoPromoted: 2,
					numAutoRelegated: 3,
					numPromotionPlayoffTeams: 4,
					numPromotionPlayoffSpots: 1,
				});
			}
		}
	}
	const structure = {
		countries,
		competitionDivisions,
		promotionRelegationLinks,
	} as CompetitionStructure;

	const takenAbbrevs = new Set<string>();
	const takenNames = new Set<string>();

	const clubs = worldCountries.flatMap((country, countryId) => {
		const towns = chooseTowns(
			country.towns,
			country.numTiers * clubsPerDivision,
			random,
		);

		return competitionDivisions.flatMap((division, did) => {
			if (division.countryId !== countryId) {
				return [];
			}

			const firstTown = (division.tier - 1) * clubsPerDivision;
			return towns
				.slice(firstTown, firstTown + clubsPerDivision)
				.map((town, place) => {
					const { region, name } = nameClub({
						town,
						country,
						random,
						takenNames,
					});
					const abbrev = makeAbbrev(town.clubName ?? town.name, takenAbbrevs);
					const pop = getPop({
						tier: division.tier,
						place,
						clubsPerDivision,
						marketFactor: country.marketFactor,
						random,
					});
					const colors = pick(KIT_COLORS, random);
					const crest = generateCrestSvg({
						abbrev,
						colors,
						pattern: pickCrestPattern(random),
					});

					return {
						region,
						name,
						abbrev,
						pop,
						stadiumCapacity: getStadiumCapacity(pop),
						colors,
						imgURL: getCrestDataUrl(crest),
						cid: countryId,
						did,
						divisionId: division.divisionId,
						location: {
							town: town.name,
							country: country.name,
							wikipedia: town.wikipedia,
						},
					};
				});
		});
	});

	return {
		structure,
		clubs: clubs.map((club, tid) => ({ tid, ...club })),
	};
};

/** The pilot World: England and Spain, with 16 clubs in each Division */
export const generatePilotWorld = (random: () => number = Math.random) =>
	generateWorld({ random });
