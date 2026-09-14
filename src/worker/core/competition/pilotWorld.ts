import type { CompetitionStructure } from "./competitionStructure.ts";
import {
	generateCrestSvg,
	getCrestDataUrl,
	pickCrestPattern,
} from "./crests.ts";
import { getStadiumCapacity } from "./worldSettings.ts";

// International Soccer Zen GM mod (Epic 7): the pilot World, a real-country
// setting with fictional clubs, created from the New League page

export const PILOT_CLUBS_PER_DIVISION = 16;

// A double round robin
const PILOT_NUM_GAMES = 2 * (PILOT_CLUBS_PER_DIVISION - 1);

const ENGLISH_TOWN_STARTS = [
	"Ash",
	"Beck",
	"Bram",
	"Brook",
	"Castle",
	"Clay",
	"Dun",
	"Eld",
	"Fair",
	"Glen",
	"Hart",
	"High",
	"Kings",
	"Lang",
	"Mill",
	"North",
	"Oak",
	"Ridge",
	"Rock",
	"Sand",
	"Stone",
	"Thorn",
	"West",
	"White",
];
const ENGLISH_TOWN_ENDS = [
	"bury",
	"by",
	"field",
	"ford",
	"ham",
	"ley",
	"mouth",
	"port",
	"stead",
	"ton",
	"wick",
	"worth",
];
const ENGLISH_CLUB_NAMES = [
	"Albion",
	"Athletic",
	"Borough",
	"City",
	"County",
	"Rangers",
	"Rovers",
	"Town",
	"United",
	"Wanderers",
];

const SPANISH_TOWN_STARTS = [
	"Alta",
	"Arro",
	"Bena",
	"Cala",
	"Campo",
	"Casa",
	"Fuente",
	"Mira",
	"Monte",
	"Puerto",
	"Rio",
	"Sierra",
	"Torre",
	"Valle",
	"Vega",
	"Villa",
];
const SPANISH_TOWN_ENDS = [
	"alba",
	"blanca",
	" del Mar",
	"dorada",
	"hermosa",
	"llana",
	"mar",
	"nueva",
	"real",
	"rica",
	"sol",
	"verde",
];
// An empty prefix is just the town, and is the most common
const SPANISH_CLUB_PREFIXES = [
	"",
	"",
	"",
	"",
	"Atlético",
	"Deportivo",
	"Racing",
	"Real",
	"Sporting",
];
const SPANISH_CLUB_NAMES = ["CF", "FC"];

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
 * `count` different town names from every combination of `starts` and `ends`
 */
const getTowns = (
	starts: string[],
	ends: string[],
	count: number,
	random: () => number,
) => {
	const all = starts.flatMap((start) => ends.map((end) => `${start}${end}`));
	return shuffled(all, random).slice(0, count);
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
 * place in its Division's pecking order (0 is the biggest). Top-tier clubs are
 * bigger, and the biggest few are much bigger than the rest, so there are
 * traditional big clubs for promotion and relegation stories.
 */
const getPop = (tier: number, place: number, random: () => number) => {
	const size = (1 - place / (PILOT_CLUBS_PER_DIVISION - 1)) ** 2;
	const [min, range] = tier === 1 ? [1.2, 6.8] : [0.5, 1.8];
	return Math.round((min + range * size * (0.85 + 0.3 * random())) * 100) / 100;
};

/**
 * The pilot World: England and Spain, each with two tiers of
 * PILOT_CLUBS_PER_DIVISION clubs playing a double round robin. In each Country
 * the bottom 3 of the top tier go down, and the top 2 of the second tier go up
 * along with the winner of a playoff among the next 4. Clubs get generated
 * soccer-style names, three letter abbreviations, kit colors, and market sizes.
 * `random` is uniform on [0, 1), so passing the same numbers makes the same
 * World.
 */
export const generatePilotWorld = (random: () => number = Math.random) => {
	const structure: CompetitionStructure = {
		countries: [
			{ countryId: 0, name: "England" },
			{ countryId: 1, name: "Spain" },
		],
		competitionDivisions: [
			{
				divisionId: 1,
				countryId: 0,
				tier: 1,
				name: "English First Division",
				numGames: PILOT_NUM_GAMES,
			},
			{
				divisionId: 2,
				countryId: 0,
				tier: 2,
				name: "English Second Division",
				numGames: PILOT_NUM_GAMES,
			},
			{
				divisionId: 3,
				countryId: 1,
				tier: 1,
				name: "Spanish First Division",
				numGames: PILOT_NUM_GAMES,
			},
			{
				divisionId: 4,
				countryId: 1,
				tier: 2,
				name: "Spanish Second Division",
				numGames: PILOT_NUM_GAMES,
			},
		],
		promotionRelegationLinks: [1, 3].map((upperDivisionId, i) => ({
			id: i + 1,
			countryId: i,
			upperDivisionId,
			lowerDivisionId: upperDivisionId + 1,
			numAutoPromoted: 2,
			numAutoRelegated: 3,
			numPromotionPlayoffTeams: 4,
			numPromotionPlayoffSpots: 1,
		})),
	};

	const numTowns = 2 * PILOT_CLUBS_PER_DIVISION;
	const englishTowns = getTowns(
		ENGLISH_TOWN_STARTS,
		ENGLISH_TOWN_ENDS,
		numTowns,
		random,
	);
	const spanishTowns = getTowns(
		SPANISH_TOWN_STARTS,
		SPANISH_TOWN_ENDS,
		numTowns,
		random,
	);

	const takenAbbrevs = new Set<string>();

	const clubs = structure.competitionDivisions.flatMap((division, did) => {
		const english = division.countryId === 0;
		const towns = english ? englishTowns : spanishTowns;
		const firstTown = (division.tier - 1) * PILOT_CLUBS_PER_DIVISION;

		return towns
			.slice(firstTown, firstTown + PILOT_CLUBS_PER_DIVISION)
			.map((town, place) => {
				let region;
				let name;
				if (english) {
					region = town;
					name = pick(ENGLISH_CLUB_NAMES, random);
				} else {
					const prefix = pick(SPANISH_CLUB_PREFIXES, random);
					region = prefix ? `${prefix} ${town}` : town;
					name = pick(SPANISH_CLUB_NAMES, random);
				}

				const abbrev = makeAbbrev(town, takenAbbrevs);
				const pop = getPop(division.tier, place, random);
				const colors = pick(KIT_COLORS, random);
				const crest = generateCrestSvg({
					abbrev,
					colors,
					pattern: pickCrestPattern(random),
				});

				return {
					tid: did * PILOT_CLUBS_PER_DIVISION + place,
					region,
					name,
					abbrev,
					pop,
					stadiumCapacity: getStadiumCapacity(pop),
					colors,
					imgURL: getCrestDataUrl(crest),
					cid: division.countryId,
					did,
					divisionId: division.divisionId,
				};
			});
	});

	return { structure, clubs };
};
