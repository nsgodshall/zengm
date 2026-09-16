import { generateLetterLogoSvg, getCrestDataUrl } from "./crests.ts";
import type { RealClub } from "./worldCountries.ts";

// International Soccer Zen GM mod (Epic 7): Mexico's real clubs, decided with
// the user, and they're baseball clubs, not football ones. The top tier is the
// Liga Mexicana de Béisbol's stronger clubs and the biggest winter league
// (Liga Mexicana del Pacífico) clubs; the second tier is the rest of the LMB
// alongside historic franchises, plus the Zacatecas Nopales, which the user
// made up. Each tier is taken in order (`realClubsInOrder`), roughly by
// stature, so a smaller Division keeps the clubs at the top of its list. Cap
// insignias and logos are copied from Wikipedia into
// public/img/world-logos/mexico/; clubs whose logo isn't there (the historic
// ones, and the Nopales, which never existed) get a generated letter logo in
// their colors instead (see generateLetterLogoSvg). Towns are from
// MEXICAN_TOWNS.
//
// A club's region is its nickname, which ZenGM's tables show on its own, and
// its name is the "de <place>" that follows it in real life ("Diablos Rojos"
// "del México").

type Colors = RealClub["colors"];

const crest = (file: string) => `/img/world-logos/mexico/${file}`;

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

export const MEXICAN_CLUBS_BY_TIER: RealClub[][] = [
	[
		club(
			"Diablos Rojos",
			"del México",
			"DIA",
			"Mexico City",
			["#e2001a", "#000000", "#ffffff"],
			file("diablos-rojos.svg"),
		),
		club(
			"Sultanes",
			"de Monterrey",
			"SUL",
			"Monterrey",
			["#0a2240", "#c8102e", "#ffffff"],
			file("sultanes-monterrey.svg"),
		),
		club(
			"Tigres",
			"de Quintana Roo",
			"TQR",
			"Cancún",
			["#f4a300", "#000000", "#ffffff"],
			file("tigres-quintana-roo.svg"),
		),
		club(
			"Pericos",
			"de Puebla",
			"PER",
			"Puebla",
			["#00a651", "#ffffff", "#000000"],
			file("pericos-puebla.svg"),
		),
		club(
			"Leones",
			"de Yucatán",
			"LEO",
			"Mérida",
			["#004b8d", "#ffffff", "#c8102e"],
			file("leones-yucatan.svg"),
		),
		club(
			"Charros",
			"de Jalisco",
			"CHJ",
			"Guadalajara",
			["#0a2240", "#c8102e", "#ffffff"],
			file("charros-jalisco.svg"),
		),
		club(
			"Toros",
			"de Tijuana",
			"TOR",
			"Tijuana",
			["#000000", "#c8102e", "#ffffff"],
			file("toros-tijuana.png"),
		),
		club(
			"Acereros",
			"del Norte",
			"ACE",
			"Monclova",
			["#00457c", "#f4a300", "#ffffff"],
			file("acereros-monclova.png"),
		),
		club(
			"Saraperos",
			"de Saltillo",
			"SAR",
			"Saltillo",
			["#00843d", "#ffffff", "#000000"],
			file("saraperos-saltillo.png"),
		),
		club(
			"Algodoneros",
			"Unión Laguna",
			"ALG",
			"Torreón",
			["#00843d", "#ffffff", "#000000"],
			file("algodoneros-laguna.svg"),
		),
		club(
			"Bravos",
			"de León",
			"BRA",
			"León",
			["#00457c", "#c8102e", "#ffffff"],
			file("bravos-leon.svg"),
		),
		club(
			"Rieleros",
			"de Aguascalientes",
			"RIE",
			"Aguascalientes",
			["#c8102e", "#0a2240", "#ffffff"],
			file("rieleros-aguascalientes.png"),
		),
		club(
			"Naranjeros",
			"de Hermosillo",
			"NAR",
			"Hermosillo",
			["#f4a300", "#000000", "#ffffff"],
			file("naranjeros-hermosillo.svg"),
		),
		club(
			"Tomateros",
			"de Culiacán",
			"TOM",
			"Culiacán",
			["#c8102e", "#ffffff", "#000000"],
			file("tomateros-culiacan.svg"),
		),
		club(
			"Águilas",
			"de Mexicali",
			"AME",
			"Mexicali",
			["#0a2240", "#c8102e", "#ffffff"],
			file("aguilas-mexicali.svg"),
		),
		club(
			"Venados",
			"de Mazatlán",
			"VMZ",
			"Mazatlán",
			["#c8102e", "#ffffff", "#000000"],
			file("venados-mazatlan.png"),
		),
		club(
			"Cañeros",
			"de Los Mochis",
			"CAN",
			"Los Mochis",
			["#00843d", "#ffffff", "#000000"],
			file("caneros-los-mochis.svg"),
		),
		club(
			"Yaquis",
			"de Obregón",
			"YAQ",
			"Ciudad Obregón",
			["#0a2240", "#c8102e", "#ffffff"],
			generated("OBR"),
		),
		club(
			"Mayos",
			"de Navojoa",
			"MAY",
			"Navojoa",
			["#c8102e", "#0a2240", "#ffffff"],
			file("mayos-navojoa.svg"),
		),
		club(
			"Algodoneros",
			"de Guasave",
			"GUA",
			"Guasave",
			["#00457c", "#ffffff", "#000000"],
			file("algodoneros-guasave.svg"),
		),
	],
	[
		club(
			"Piratas",
			"de Campeche",
			"PIR",
			"Campeche",
			["#000000", "#c8102e", "#ffffff"],
			file("piratas-campeche.svg"),
		),
		club(
			"Olmecas",
			"de Tabasco",
			"OLM",
			"Villahermosa",
			["#00457c", "#f4a300", "#ffffff"],
			file("olmecas-tabasco.svg"),
		),
		club(
			"Guerreros",
			"de Oaxaca",
			"GUE",
			"Oaxaca",
			["#00843d", "#c8102e", "#ffffff"],
			file("guerreros-oaxaca.svg"),
		),
		club(
			"El Águila",
			"de Veracruz",
			"AGV",
			"Veracruz",
			["#c8102e", "#0a2240", "#ffffff"],
			file("aguila-veracruz.svg"),
		),
		club(
			"Dorados",
			"de Chihuahua",
			"DOR",
			"Chihuahua",
			["#f4a300", "#000000", "#ffffff"],
			file("dorados-chihuahua.svg"),
		),
		club(
			"Mariachis",
			"de Guadalajara",
			"MAR",
			"Guadalajara",
			["#00457c", "#f4a300", "#ffffff"],
			file("mariachis-guadalajara.svg"),
		),
		club(
			"Tecolotes",
			"de los Dos Laredos",
			"TEC",
			"Nuevo Laredo",
			["#00843d", "#ffffff", "#000000"],
			file("tecolotes-dos-laredos.png"),
		),
		club(
			"Conspiradores",
			"de Querétaro",
			"CQO",
			"Querétaro",
			["#6a1b9a", "#ffffff", "#000000"],
			file("conspiradores-queretaro.svg"),
		),
		// The user's own club
		club(
			"Nopales",
			"de Zacatecas",
			"ZNO",
			"Zacatecas",
			["#00843d", "#c8102e", "#ffffff"],
			generated("ZAC"),
		),
		club(
			"Generales",
			"de Durango",
			"DGO",
			"Durango",
			["#0a2240", "#c8102e", "#ffffff"],
			generated("DGO"),
		),
		club(
			"Ángeles",
			"de Puebla",
			"ANG",
			"Puebla",
			["#00457c", "#ffffff", "#c8102e"],
			generated("PUE"),
		),
		club(
			"Alijadores",
			"de Tampico",
			"ALI",
			"Tampico",
			["#c8102e", "#0a2240", "#ffffff"],
			generated("TAM"),
		),
		club(
			"Broncos",
			"de Reynosa",
			"BRY",
			"Reynosa",
			["#00843d", "#f4a300", "#ffffff"],
			generated("REY"),
		),
		club(
			"Chileros",
			"de Xalapa",
			"CHX",
			"Xalapa",
			["#00843d", "#c8102e", "#ffffff"],
			generated("XAL"),
		),
		club(
			"Tuneros",
			"de San Luis",
			"TUN",
			"San Luis Potosí",
			["#f4a300", "#00457c", "#ffffff"],
			generated("SLP"),
		),
		club(
			"Cafeteros",
			"de Córdoba",
			"CAF",
			"Córdoba",
			["#6f4e37", "#ffffff", "#00843d"],
			generated("COR"),
		),
		club(
			"Petroleros",
			"de Minatitlán",
			"PMI",
			"Minatitlán",
			["#000000", "#f4a300", "#ffffff"],
			generated("MIN"),
		),
		club(
			"Petroleros",
			"de Poza Rica",
			"PPR",
			"Poza Rica",
			["#00457c", "#f4a300", "#ffffff"],
			generated("PZR"),
		),
		club(
			"Delfines",
			"del Carmen",
			"DEL",
			"Ciudad del Carmen",
			["#00a0e9", "#ffffff", "#0a2240"],
			generated("CAR"),
		),
		club(
			"Coras",
			"de Tepic",
			"CTP",
			"Tepic",
			["#c8102e", "#ffffff", "#000000"],
			generated("TEP"),
		),
	],
];
