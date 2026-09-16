import { generateLetterLogoSvg, getCrestDataUrl } from "./crests.ts";
import type { RealClub } from "./worldCountries.ts";

// International Soccer Zen GM mod (Epic 7): Japan's real clubs, decided with the
// user. The top tier is baseball first: all 12 Nippon Professional Baseball
// clubs, then the 8 biggest J.League clubs, and the second tier is 20 more
// J.League clubs. Each tier is taken in order (`realClubsInOrder`), roughly by
// stature, so a smaller Division keeps the clubs at the top of its list. Crests
// are copied from Wikipedia into public/img/world-logos/japan/; J.League crests
// are mostly not on Commons, so the clubs whose crest isn't there get a
// generated letter logo in their colors instead (see generateLetterLogoSvg).
// Towns are from JAPANESE_TOWNS.
//
// A club's region is the place or sponsor name fans use, which ZenGM's tables
// show on its own, and its name is the nickname ("Yomiuri" "Giants").

type Colors = RealClub["colors"];

const crest = (file: string) => `/img/world-logos/japan/${file}`;

const club = (
	region: string,
	name: string,
	abbrev: string,
	town: string,
	colors: Colors,
	imgURL: (colors: Colors) => string,
): RealClub => ({ region, name, abbrev, town, colors, imgURL: imgURL(colors) });

const file = (name: string) => () => crest(name);

const generated = (text: string) => (colors: Colors) =>
	getCrestDataUrl(generateLetterLogoSvg({ letters: text, colors }));

export const JAPANESE_CLUBS_BY_TIER: RealClub[][] = [
	[
		club(
			"Yomiuri",
			"Giants",
			"YOM",
			"Tokyo",
			["#f97709", "#000000", "#ffffff"],
			file("yomiuri-giants.svg"),
		),
		club(
			"Hanshin",
			"Tigers",
			"HAN",
			"Nishinomiya",
			["#ffe201", "#000000", "#ffffff"],
			file("hanshin-tigers.svg"),
		),
		club(
			"SoftBank",
			"Hawks",
			"SBK",
			"Fukuoka",
			["#fcc800", "#000000", "#ffffff"],
			file("softbank-hawks.svg"),
		),
		club(
			"DeNA",
			"BayStars",
			"DNA",
			"Yokohama",
			["#0055a5", "#ffffff", "#000000"],
			file("dena-baystars.svg"),
		),
		club(
			"Hiroshima",
			"Carp",
			"HIR",
			"Hiroshima",
			["#e60012", "#ffffff", "#000000"],
			file("hiroshima-carp.svg"),
		),
		club(
			"Chunichi",
			"Dragons",
			"CHU",
			"Nagoya",
			["#002569", "#ffffff", "#000000"],
			file("chunichi-dragons.svg"),
		),
		club(
			"Yakult",
			"Swallows",
			"YAK",
			"Tokyo",
			["#98002e", "#00a0e9", "#ffffff"],
			file("yakult-swallows.svg"),
		),
		club(
			"Nippon-Ham",
			"Fighters",
			"NIP",
			"Sapporo",
			["#01609a", "#c0c0c0", "#ffffff"],
			file("nippon-ham-fighters.svg"),
		),
		club(
			"Seibu",
			"Lions",
			"SEI",
			"Tokorozawa",
			["#102b6a", "#00b0eb", "#ffffff"],
			file("seibu-lions.svg"),
		),
		club(
			"Lotte",
			"Marines",
			"LOT",
			"Chiba",
			["#000000", "#ffffff", "#c0c0c0"],
			file("lotte-marines.svg"),
		),
		club(
			"Orix",
			"Buffaloes",
			"ORI",
			"Osaka",
			["#000019", "#b39230", "#ffffff"],
			file("orix-buffaloes.svg"),
		),
		club(
			"Rakuten",
			"Golden Eagles",
			"RAK",
			"Sendai",
			["#860010", "#c8a740", "#ffffff"],
			file("rakuten-eagles.svg"),
		),
		club(
			"Urawa",
			"Red Diamonds",
			"URA",
			"Saitama",
			["#e60012", "#000000", "#ffffff"],
			file("urawa-red-diamonds.svg"),
		),
		club(
			"Kashima",
			"Antlers",
			"KSA",
			"Kashima",
			["#95002b", "#003876", "#ffffff"],
			file("kashima-antlers.svg"),
		),
		club(
			"Yokohama",
			"F. Marinos",
			"YFM",
			"Yokohama",
			["#004098", "#ffffff", "#e60012"],
			file("yokohama-f-marinos.svg"),
		),
		club(
			"Kawasaki",
			"Frontale",
			"KWF",
			"Kawasaki",
			["#00a0e9", "#000000", "#ffffff"],
			file("kawasaki-frontale.svg"),
		),
		club(
			"Gamba",
			"Osaka",
			"GAM",
			"Osaka",
			["#00348e", "#000000", "#ffffff"],
			file("gamba-osaka.svg"),
		),
		club(
			"Cerezo",
			"Osaka",
			"CER",
			"Osaka",
			["#e5007f", "#ffffff", "#000000"],
			file("cerezo-osaka.svg"),
		),
		club(
			"Vissel",
			"Kobe",
			"VIS",
			"Kobe",
			["#8e0b1e", "#ffffff", "#000000"],
			file("vissel-kobe.svg"),
		),
		club(
			"FC",
			"Tokyo",
			"FCT",
			"Tokyo",
			["#002d72", "#e60012", "#ffffff"],
			file("fc-tokyo.svg"),
		),
	],
	[
		club(
			"Sanfrecce",
			"Hiroshima",
			"SAN",
			"Hiroshima",
			["#4b0082", "#ffffff", "#000000"],
			file("sanfrecce-hiroshima.svg"),
		),
		club(
			"Nagoya",
			"Grampus",
			"NGY",
			"Nagoya",
			["#e8380d", "#ffffff", "#000000"],
			generated("NAG"),
		),
		club(
			"Consadole",
			"Sapporo",
			"CON",
			"Sapporo",
			["#e60012", "#000000", "#ffffff"],
			file("consadole-sapporo.svg"),
		),
		club(
			"Avispa",
			"Fukuoka",
			"AVI",
			"Fukuoka",
			["#00286e", "#c8a740", "#ffffff"],
			file("avispa-fukuoka.svg"),
		),
		club(
			"Kashiwa",
			"Reysol",
			"KSR",
			"Kashiwa",
			["#ffd900", "#000000", "#ffffff"],
			file("kashiwa-reysol.svg"),
		),
		club(
			"Sagan",
			"Tosu",
			"TOS",
			"Tosu",
			["#0068b7", "#ec6c00", "#ffffff"],
			file("sagan-tosu.svg"),
		),
		club(
			"Shimizu",
			"S-Pulse",
			"SPU",
			"Shizuoka",
			["#ff6600", "#000000", "#ffffff"],
			file("shimizu-s-pulse.svg"),
		),
		club(
			"Júbilo",
			"Iwata",
			"JUB",
			"Hamamatsu",
			["#00a0e9", "#ffffff", "#000000"],
			file("jubilo-iwata.svg"),
		),
		club(
			"Albirex",
			"Niigata",
			"ALN",
			"Niigata",
			["#f39800", "#004098", "#ffffff"],
			file("albirex-niigata.svg"),
		),
		club(
			"Kyoto",
			"Sanga",
			"KYO",
			"Kyoto",
			["#8e0b1e", "#ffffff", "#000000"],
			file("kyoto-sanga.svg"),
		),
		club(
			"Vegalta",
			"Sendai",
			"VEG",
			"Sendai",
			["#ffd900", "#0068b7", "#ffffff"],
			file("vegalta-sendai.svg"),
		),
		club(
			"Montedio",
			"Yamagata",
			"MON",
			"Yamagata",
			["#0068b7", "#f39800", "#ffffff"],
			file("montedio-yamagata.png"),
		),
		club(
			"Ventforet",
			"Kofu",
			"KOF",
			"Kofu",
			["#003893", "#e60012", "#ffffff"],
			file("ventforet-kofu.svg"),
		),
		club(
			"Matsumoto",
			"Yamaga",
			"MAT",
			"Matsumoto",
			["#00693e", "#ffffff", "#000000"],
			file("matsumoto-yamaga.svg"),
		),
		club(
			"Machida",
			"Zelvia",
			"MAC",
			"Machida",
			["#003893", "#ffffff", "#000000"],
			file("machida-zelvia.svg"),
		),
		club(
			"Shonan",
			"Bellmare",
			"SHO",
			"Hiratsuka",
			["#00a0e9", "#00693e", "#ffffff"],
			file("shonan-bellmare.svg"),
		),
		club(
			"Oita",
			"Trinita",
			"OIT",
			"Oita",
			["#0068b7", "#ffd900", "#ffffff"],
			file("oita-trinita.svg"),
		),
		club(
			"V-Varen",
			"Nagasaki",
			"VVN",
			"Nagasaki",
			["#003893", "#f39800", "#ffffff"],
			file("v-varen-nagasaki.svg"),
		),
		club(
			"Roasso",
			"Kumamoto",
			"ROA",
			"Kumamoto",
			["#e60012", "#000000", "#ffffff"],
			file("roasso-kumamoto.svg"),
		),
		club(
			"Tokushima",
			"Vortis",
			"VOR",
			"Tokushima",
			["#0068b7", "#ffffff", "#000000"],
			file("tokushima-vortis.svg"),
		),
	],
];
