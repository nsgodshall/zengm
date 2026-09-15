import {
	ENGLISH_TOWNS,
	type PilotTown,
	REAL_ENGLISH_CLUB_NAMES,
	REAL_SPANISH_CLUB_NAMES,
	SPANISH_TOWNS,
} from "./pilotTowns.ts";
import {
	AMERICAN_TOWNS,
	GERMAN_TOWNS,
	ITALIAN_TOWNS,
	JAPANESE_TOWNS,
	MEXICAN_TOWNS,
	REAL_AMERICAN_CLUB_NAMES,
	REAL_GERMAN_CLUB_NAMES,
	REAL_ITALIAN_CLUB_NAMES,
	REAL_JAPANESE_CLUB_NAMES,
	REAL_MEXICAN_CLUB_NAMES,
} from "./worldTowns.ts";
import { AMERICAN_REAL_CLUBS } from "./americanClubs.ts";

// International Soccer Zen GM mod (Epic 7): the Countries a new World can be
// made of, chosen on the New World page (see generateWorld)

/**
 * How a club can be named: its region and name, which ZenGM shows together as
 * "region name", with {town} standing for its town. A pattern listed twice is
 * twice as likely.
 */
export type ClubNamePattern = [region: string, name: string];

/**
 * A real team a Country's top tier is made of, instead of generated clubs (see
 * chooseRealClubs)
 */
export type RealClub = {
	region: string;
	name: string;
	abbrev: string;
	// Its town, one of its Country's towns, for its market size and team page
	town: string;
	// Primary, secondary, and accent colors
	colors: [string, string, string];
	// Its logo, served from public/
	imgURL: string;
	// Picked before the rest when a top tier has fewer clubs than there are
	// real clubs
	pickFirst: boolean;
};

export type WorldCountry = {
	key: string;
	name: string;
	adjective: string;
	numTiers: number;
	towns: PilotTown[];
	realClubNames: string[];
	// Real teams for its top tier, as many as the biggest Division has clubs
	realTopTierClubs?: RealClub[];
	namePatterns: ClubNamePattern[];
	// Decided: it's basketball, so the USA is number 1, and the rest follow
	// their rough basketball standing. A Country's starting squads rank lower
	// the higher this is, where a whole tier is 1 (see getSquadOrder).
	startingStrengthPenalty: number;
	// Its clubs' market sizes are multiplied by this
	marketFactor: number;
};

const withSuffixes = (suffixes: string[]): ClubNamePattern[] =>
	suffixes.map((suffix) => ["{town}", suffix]);

const withPrefixes = (prefixes: string[]): ClubNamePattern[] =>
	prefixes.map((prefix) => [prefix, "{town}"]);

// In the order they appear in a World
export const WORLD_COUNTRIES: WorldCountry[] = [
	{
		key: "england",
		name: "England",
		adjective: "English",
		numTiers: 2,
		towns: ENGLISH_TOWNS,
		realClubNames: REAL_ENGLISH_CLUB_NAMES,
		namePatterns: withSuffixes([
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
		]),
		startingStrengthPenalty: 0.5,
		marketFactor: 1,
	},
	{
		key: "spain",
		name: "Spain",
		adjective: "Spanish",
		numTiers: 2,
		towns: SPANISH_TOWNS,
		realClubNames: REAL_SPANISH_CLUB_NAMES,
		namePatterns: [
			["{town}", "CF"],
			["{town}", "CF"],
			["{town}", "FC"],
			["{town}", "FC"],
			["Atlético {town}", "CF"],
			["Deportivo {town}", "CF"],
			["Racing {town}", "FC"],
			["Real {town}", "CF"],
			["Sporting {town}", "FC"],
		],
		startingStrengthPenalty: 0.2,
		marketFactor: 1,
	},
	{
		key: "usa",
		name: "USA",
		adjective: "American",
		numTiers: 3,
		towns: AMERICAN_TOWNS,
		realClubNames: REAL_AMERICAN_CLUB_NAMES,
		// Decided with the user: the USA's top tier is real teams
		realTopTierClubs: AMERICAN_REAL_CLUBS,
		namePatterns: [
			...withSuffixes(["FC", "FC", "SC", "United", "City", "Athletic"]),
			...withPrefixes(["Real", "Sporting", "Inter"]),
		],
		startingStrengthPenalty: 0,
		marketFactor: 1.3,
	},
	{
		key: "mexico",
		name: "Mexico",
		adjective: "Mexican",
		numTiers: 2,
		towns: MEXICAN_TOWNS,
		realClubNames: REAL_MEXICAN_CLUB_NAMES,
		namePatterns: [
			...withPrefixes([
				"Club",
				"Club",
				"Atlético",
				"Deportivo",
				"Real",
				"Racing",
			]),
			...withSuffixes(["FC"]),
		],
		startingStrengthPenalty: 0.4,
		marketFactor: 0.85,
	},
	{
		key: "italy",
		name: "Italy",
		adjective: "Italian",
		numTiers: 2,
		towns: ITALIAN_TOWNS,
		realClubNames: REAL_ITALIAN_CLUB_NAMES,
		namePatterns: [
			...withPrefixes([
				"AC",
				"US",
				"AS",
				"Virtus",
				"Pro",
				"Olimpia",
				"Fortitudo",
				"Sporting",
			]),
			...withSuffixes(["Calcio"]),
		],
		startingStrengthPenalty: 0.3,
		marketFactor: 1,
	},
	{
		key: "germany",
		name: "Germany",
		adjective: "German",
		numTiers: 2,
		towns: GERMAN_TOWNS,
		realClubNames: REAL_GERMAN_CLUB_NAMES,
		namePatterns: withPrefixes([
			"FC",
			"FC",
			"SV",
			"VfL",
			"TSV",
			"SC",
			"Borussia",
			"Eintracht",
			"Fortuna",
			"Viktoria",
			"Alemannia",
			"Union",
			"Germania",
			"Rot-Weiss",
			"Blau-Weiss",
		]),
		startingStrengthPenalty: 0.15,
		marketFactor: 1,
	},
	{
		key: "japan",
		name: "Japan",
		adjective: "Japanese",
		numTiers: 2,
		towns: JAPANESE_TOWNS,
		realClubNames: REAL_JAPANESE_CLUB_NAMES,
		namePatterns: [
			...withSuffixes([
				"FC",
				"FC",
				"SC",
				"United",
				"Hayabusa",
				"Tsubasa",
				"Raijin",
				"Sakura",
				"Stella",
				"Fenice",
				"Aquila",
				"Volante",
				"Kaze",
				"Ryujin",
			]),
			["FC", "{town}"],
		],
		startingStrengthPenalty: 0.45,
		marketFactor: 0.9,
	},
];

export const DEFAULT_WORLD_COUNTRY_KEYS = ["england", "spain"];
