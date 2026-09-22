import { generateLetterLogoSvg, getCrestDataUrl } from "./crests.ts";
import type { RealClub } from "./worldCountries.ts";

// International Soccer Zen GM mod (Epic 7): the USA's real clubs, chosen and
// ranked by the user: real pro, minor league, and college teams from any sport,
// in all three tiers. Clubs are named for cities, never states or schools, and a
// college team can play in a bigger city near its campus ("Oklahoma City
// Sooners"). Each tier is in the user's order, best first.
//
// Logos follow the user's rules: never a logo that gives away another sport, and
// letters that stand for the city, not the school (so no "UT" for Austin or "OU"
// for Oklahoma City). A club uses its own letter, cap, or mascot logo where it
// has one, copied from Wikipedia into public/img/world-logos/usa/. Otherwise it
// gets a generated letter logo in its colors (see generateLetterLogoSvg): the
// city's initial, or more of the city's letters when another club in the same
// tier already has that initial. Towns are from AMERICAN_TOWNS, for each club's
// market size and team page.

type Colors = RealClub["colors"];

const logo = (file: string) => `/img/world-logos/usa/${file}`;

const letters = (text: string, colors: Colors) =>
	getCrestDataUrl(generateLetterLogoSvg({ letters: text, colors }));

const club = (
	region: string,
	name: string,
	abbrev: string,
	town: string,
	colors: Colors,
	imgURL: (colors: Colors) => string,
	pickFirst?: true,
): RealClub => ({
	region,
	name,
	abbrev,
	town,
	colors,
	imgURL: imgURL(colors),
	...(pickFirst ? { pickFirst } : {}),
});

const file = (name: string) => () => logo(name);
const generated = (text: string) => (colors: Colors) => letters(text, colors);

// The user's highest ranked clubs (pickFirst), picked before the rest when the
// top tier has fewer than 20 clubs
const TOP_TIER: RealClub[] = [
	club(
		"New York",
		"Yankees",
		"NYY",
		"New York City",
		["#0c2340", "#ffffff", "#c4ced3"],
		file("new-york-yankees.svg"),
		true,
	),
	club(
		"Brooklyn",
		"Dodgers",
		"BKN",
		"New York City",
		["#113388", "#ffffff", "#dd1133"],
		file("brooklyn-dodgers.svg"),
		true,
	),
	// "LI" for Long Island, since the Yankees have New York's "NY"
	club(
		"New York",
		"Islanders",
		"NYI",
		"New York City",
		["#00539b", "#f47d30", "#ffffff"],
		generated("LI"),
		true,
	),
	// After UCLA
	club(
		"Los Angeles",
		"Bruins",
		"LAB",
		"Los Angeles",
		["#2774ae", "#ffd100", "#ffffff"],
		generated("LA"),
		true,
	),
	club(
		"Anaheim",
		"Angels",
		"ANA",
		"Anaheim",
		["#ba0021", "#003263", "#ffffff"],
		generated("A"),
		true,
	),
	club(
		"Chicago",
		"Bears",
		"CHI",
		"Chicago",
		["#0b162a", "#e64100", "#ffffff"],
		file("chicago-bears.svg"),
		true,
	),
	club(
		"Dallas",
		"Cowboys",
		"DAL",
		"Dallas",
		["#002244", "#869397", "#ffffff"],
		generated("DAL"),
		true,
	),
	club(
		"Houston",
		"Colt .45s",
		"HOU",
		"Houston",
		["#12284b", "#eb6e1f", "#ffffff"],
		generated("H"),
		true,
	),
	club(
		"Atlanta",
		"Braves",
		"ATL",
		"Atlanta",
		["#13274f", "#ce1141", "#ffffff"],
		generated("ATL"),
		true,
	),
	club(
		"Washington",
		"Senators",
		"WAS",
		"Washington",
		["#ab0003", "#14225a", "#ffffff"],
		generated("W"),
		true,
	),
	// An "M" logo, Miami University's RedHawks
	club(
		"Miami",
		"Hurricanes",
		"MIA",
		"Miami",
		["#f47321", "#005030", "#ffffff"],
		file("miami-hurricanes.svg"),
		true,
	),
	club(
		"Philadelphia",
		"Phillies",
		"PHI",
		"Philadelphia",
		["#c81e3b", "#013b73", "#ffffff"],
		file("philadelphia-phillies.svg"),
		true,
	),
	club(
		"Phoenix",
		"Sun Devils",
		"PHX",
		"Phoenix",
		["#8c1d40", "#ffc627", "#ffffff"],
		generated("PHX"),
		true,
	),
	club(
		"Boston",
		"Minutemen",
		"BOS",
		"Boston",
		["#c8102e", "#0c2340", "#ffffff"],
		generated("BOS"),
	),
	club(
		"San Bernardino",
		"Highlanders",
		"SBH",
		"San Bernardino",
		["#1b365d", "#c69214", "#ffffff"],
		generated("SB"),
	),
	club(
		"San Francisco",
		"Seals",
		"SFS",
		"San Francisco",
		["#222222", "#ffffff", "#999999"],
		file("san-francisco-seals.svg"),
	),
	club(
		"Oakland",
		"Raiders",
		"OAK",
		"Oakland",
		["#000000", "#a5acaf", "#ffffff"],
		generated("O"),
	),
	club(
		"Detroit",
		"Tigers",
		"DET",
		"Detroit",
		["#0c2c56", "#fa4616", "#ffffff"],
		file("detroit-tigers.svg"),
	),
	club(
		"Seattle",
		"Sonics",
		"SEA",
		"Seattle",
		["#005831", "#ffc121", "#ffffff"],
		generated("S"),
	),
	club(
		"Minneapolis",
		"Thunder",
		"MIN",
		"Minneapolis",
		["#0b2e5c", "#8fc4e8", "#ffffff"],
		generated("MIN"),
	),
];

// College teams are after the schools (Texas Longhorns, Ohio State Buckeyes, and
// so on), in cities near them
const SECOND_TIER: RealClub[] = [
	club(
		"San Diego",
		"Aztecs",
		"SDA",
		"San Diego",
		["#c41230", "#000000", "#ffffff"],
		generated("SD"),
	),
	club(
		"Denver",
		"Buffaloes",
		"DEN",
		"Denver",
		["#000000", "#cfb87c", "#ffffff"],
		generated("D"),
	),
	club(
		"Orlando",
		"Orange",
		"ORL",
		"Orlando",
		["#f47321", "#0b2265", "#ffffff"],
		generated("O"),
	),
	club(
		"Charlotte",
		"Hornets",
		"CHA",
		"Charlotte",
		["#1d1160", "#00788c", "#ffffff"],
		generated("CLT"),
	),
	club(
		"Baltimore",
		"Crabs",
		"BAL",
		"Baltimore",
		["#df4601", "#000000", "#ffffff"],
		generated("B"),
	),
	club(
		"St. Louis",
		"Cardinals",
		"STL",
		"St. Louis",
		["#c41e3a", "#0c2340", "#fedb00"],
		file("st-louis-cardinals.svg"),
	),
	club(
		"San Antonio",
		"Spurs",
		"SAS",
		"San Antonio",
		["#000000", "#c4ced4", "#ffffff"],
		generated("SA"),
	),
	// Texas's longhorn, not its "UT"
	club(
		"Austin",
		"Longhorns",
		"AUS",
		"Austin",
		["#bf5700", "#ffffff", "#333f48"],
		file("austin-longhorns.svg"),
	),
	// The old Portland Beavers' "P" cap logo
	club(
		"Portland",
		"Roses",
		"POR",
		"Portland",
		["#002255", "#6699cc", "#ffffff"],
		file("portland-roses.png"),
	),
	// The old Sacramento Solons' "S"
	club(
		"Sacramento",
		"Bears",
		"SAC",
		"Sacramento",
		["#cc2244", "#ffffff", "#1c2c5b"],
		file("sacramento-bears.svg"),
	),
	club(
		"Pittsburgh",
		"Steelers",
		"PIT",
		"Pittsburgh",
		["#101820", "#ffb612", "#ffffff"],
		generated("PIT"),
	),
	// UNLV's Runnin' Rebels
	club(
		"Las Vegas",
		"Runnin' Rebels",
		"LVR",
		"Las Vegas",
		["#cf0a2c", "#666666", "#ffffff"],
		generated("LV"),
	),
	club(
		"Cincinnati",
		"Reds",
		"CIN",
		"Cincinnati",
		["#c6011f", "#ffffff", "#000000"],
		file("cincinnati-reds.svg"),
	),
	club(
		"Kansas City",
		"Athletics",
		"KCA",
		"Kansas City",
		["#003831", "#efb21e", "#ffffff"],
		generated("KC"),
	),
	club(
		"Columbus",
		"Buckeyes",
		"CLB",
		"Columbus",
		["#bb0000", "#666666", "#ffffff"],
		generated("C"),
	),
	club(
		"Indianapolis",
		"Hoosiers",
		"IND",
		"Indianapolis",
		["#990000", "#ffffff", "#000000"],
		generated("I"),
	),
	// Nashville's Negro League club
	club(
		"Nashville",
		"Stars",
		"NSH",
		"Nashville",
		["#0c2340", "#c8102e", "#ffffff"],
		generated("N"),
	),
	club(
		"Cleveland",
		"Spiders",
		"CLE",
		"Cleveland",
		["#0c2340", "#e31937", "#ffffff"],
		generated("CLE"),
	),
	// After South Carolina's Gamecocks
	club(
		"Jacksonville",
		"Gamecocks",
		"JAX",
		"Jacksonville",
		["#73000a", "#000000", "#ffffff"],
		generated("J"),
	),
	club(
		"Providence",
		"Sailors",
		"PVD",
		"Providence",
		["#0c2340", "#b9975b", "#ffffff"],
		generated("PVD"),
	),
];

const THIRD_TIER: RealClub[] = [
	club(
		"Raleigh",
		"Tar Heels",
		"RAL",
		"Raleigh",
		["#7bafd4", "#13294b", "#ffffff"],
		generated("R"),
	),
	club(
		"Milwaukee",
		"Badgers",
		"MIL",
		"Milwaukee",
		["#c5050c", "#ffffff", "#000000"],
		generated("M"),
	),
	club(
		"Oklahoma City",
		"Sooners",
		"OKC",
		"Oklahoma City",
		["#841617", "#fdf9d8", "#ffffff"],
		generated("OKC"),
	),
	club(
		"Richmond",
		"Redtails",
		"RIC",
		"Richmond",
		["#990000", "#0c2340", "#ffffff"],
		generated("RIC"),
	),
	club(
		"Salt Lake City",
		"Pioneers",
		"SLC",
		"Salt Lake City",
		["#cc0000", "#ffffff", "#000000"],
		generated("SLC"),
	),
	club(
		"Fresno",
		"Bulldogs",
		"FRE",
		"Fresno",
		["#c41230", "#13284c", "#ffffff"],
		file("fresno-bulldogs.svg"),
	),
	// After Alabama's elephant
	club(
		"Birmingham",
		"Elephants",
		"BIR",
		"Birmingham",
		["#9e1b32", "#ffffff", "#828a8f"],
		generated("BIR"),
	),
	club(
		"Hartford",
		"Whalers",
		"HFD",
		"Hartford",
		["#00754a", "#162d53", "#ffffff"],
		file("hartford-whalers.svg"),
	),
	club(
		"Buffalo",
		"Bills",
		"BUF",
		"Buffalo",
		["#00338d", "#c60c30", "#ffffff"],
		generated("BUF"),
	),
	// After UTEP's Miners, in their orange
	club(
		"El Paso",
		"Vaqueros",
		"ELP",
		"El Paso",
		["#ff8200", "#041e42", "#ffffff"],
		generated("E"),
	),
	// Omaha's own university logo, not Nebraska's "N"
	club(
		"Omaha",
		"Cornhuskers",
		"OMA",
		"Omaha",
		["#d00000", "#000000", "#ffffff"],
		file("omaha-cornhuskers.png"),
	),
	club(
		"Honolulu",
		"Rainbow Warriors",
		"HON",
		"Honolulu",
		["#024731", "#ffffff", "#000000"],
		file("honolulu-rainbow-warriors.svg"),
	),
	club(
		"New Orleans",
		"Jazz",
		"NOL",
		"New Orleans",
		["#461d7c", "#fdd023", "#ffffff"],
		generated("N"),
	),
	club(
		"Knoxville",
		"Volunteers",
		"KNX",
		"Knoxville",
		["#ff8200", "#ffffff", "#58595b"],
		generated("K"),
	),
	club(
		"Bakersfield",
		"Mavericks",
		"BAK",
		"Bakersfield",
		["#0033a0", "#ffc72c", "#ffffff"],
		generated("BAK"),
	),
	club(
		"Albuquerque",
		"Isotopes",
		"ABQ",
		"Albuquerque",
		["#ba0c2f", "#f2a900", "#ffffff"],
		generated("A"),
	),
	club(
		"Boise",
		"Broncos",
		"BOI",
		"Boise",
		["#0033a0", "#d64309", "#ffffff"],
		generated("BOI"),
	),
	club(
		"Ventura",
		"Pacifics",
		"VEN",
		"Ventura",
		["#006ba6", "#f2a900", "#ffffff"],
		generated("V"),
	),
	club(
		"Little Rock",
		"Razorbacks",
		"LRK",
		"Little Rock",
		["#9d2235", "#ffffff", "#000000"],
		generated("LR"),
	),
	club(
		"Spokane",
		"Beavers",
		"SPO",
		"Spokane",
		["#1c2c5b", "#cc2244", "#ffffff"],
		generated("S"),
	),
];

export const AMERICAN_CLUBS_BY_TIER: RealClub[][] = [
	TOP_TIER,
	SECOND_TIER,
	THIRD_TIER,
];
