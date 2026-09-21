import type { Team } from "../../../common/types.ts";
import { type RealClub, WORLD_COUNTRIES } from "./worldCountries.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 6d): the history real clubs bring into a World, decided with the user: a
// starting stature from their real standing (for the American, Japanese, and
// Mexican teams, their standing in their own sport), and their founding year
// and nickname. Real trophies don't count in the World; they only make big
// clubs start big.
//
// Drafted for the user's review, Country by Country. Founding years and
// nicknames are left out where they're uncertain, and the American, Japanese,
// and Mexican teams have neither yet.
//
// Keyed by abbreviation, which is unique among real clubs; the region is there
// to check the right club gets it (see getRealClubHistory).

export type RealClubHistory = {
	region: string;
	// Starting stature, from 0 to 100 (see competition/clubStature.ts)
	stature: number;
	founded?: number;
	nickname?: string;
};

const club = (
	region: string,
	stature: number,
	founded?: number,
	nickname?: string,
): RealClubHistory => ({
	region,
	stature,
	...(founded !== undefined ? { founded } : {}),
	...(nickname !== undefined ? { nickname } : {}),
});

export const REAL_CLUB_HISTORY: Record<string, RealClubHistory> = {
	// United Kingdom, first tier
	MUN: club("Manchester United", 92, 1878, "The Red Devils"),
	LIV: club("Liverpool", 92, 1892, "The Reds"),
	ARS: club("Arsenal", 86, 1886, "The Gunners"),
	CHE: club("Chelsea", 84, 1905, "The Blues"),
	MCI: club("Manchester City", 88, 1880, "The Citizens"),
	TOT: club("Tottenham Hotspur", 78, 1882, "Spurs"),
	CEL: club("Celtic", 74, 1887, "The Bhoys"),
	RAN: club("Rangers", 74, 1872, "The Gers"),
	NEW: club("Newcastle United", 72, 1892, "The Magpies"),
	AVL: club("Aston Villa", 72, 1874, "The Villans"),
	WHU: club("West Ham United", 66, 1895, "The Hammers"),
	EVE: club("Everton", 70, 1878, "The Toffees"),
	BHA: club("Brighton & Hove Albion", 55, 1901, "The Seagulls"),
	NFO: club("Nottingham Forest", 64, 1865, "The Tricky Trees"),
	CRY: club("Crystal Palace", 56, 1905, "The Eagles"),
	WOL: club("Wolverhampton Wanderers", 60, 1877, "Wolves"),
	FUL: club("Fulham", 54, 1879, "The Cottagers"),
	BRE: club("Brentford", 48, 1889, "The Bees"),
	BOU: club("Bournemouth", 46, 1899, "The Cherries"),
	LEE: club("Leeds United", 68, 1919, "The Whites"),
	// United Kingdom, second tier
	SUN: club("Sunderland", 62, 1879, "The Black Cats"),
	LEI: club("Leicester City", 62, 1884, "The Foxes"),
	SOU: club("Southampton", 58, 1885, "The Saints"),
	BUR: club("Burnley", 50, 1882, "The Clarets"),
	IPS: club("Ipswich Town", 52, 1878, "The Tractor Boys"),
	SHU: club("Sheffield United", 54, 1889, "The Blades"),
	MID: club("Middlesbrough", 54, 1876, "Boro"),
	WBA: club("West Bromwich Albion", 56, 1878, "The Baggies"),
	NOR: club("Norwich City", 52, 1902, "The Canaries"),
	CAR: club("Cardiff City", 48, 1899, "The Bluebirds"),
	SWA: club("Swansea City", 48, 1912, "The Swans"),
	WRE: club("Wrexham", 40, 1864, "The Red Dragons"),
	COV: club("Coventry City", 48, 1883, "The Sky Blues"),
	STK: club("Stoke City", 50, 1863, "The Potters"),
	ABE: club("Aberdeen", 52, 1903, "The Dons"),
	DER: club("Derby County", 56, 1884, "The Rams"),
	HUL: club("Hull City", 46, 1904, "The Tigers"),
	WAT: club("Watford", 48, 1881, "The Hornets"),
	LIN: club("Linfield", 30, 1886, "The Blues"),
	GLE: club("Glentoran", 26, 1882, "The Glens"),

	// Spain, first tier
	RMA: club("Real Madrid", 95, 1902, "Los Blancos"),
	BAR: club("Barcelona", 94, 1899, "Blaugrana"),
	ATM: club("Atlético", 84, 1903, "Los Colchoneros"),
	ATH: club("Athletic", 72, 1898, "Los Leones"),
	SEV: club("Sevilla", 72, 1890, "Los Nervionenses"),
	BET: club("Real Betis", 64, 1907, "Los Verdiblancos"),
	RSO: club("Real Sociedad", 64, 1909, "Txuri-Urdin"),
	VIL: club("Villarreal", 62, 1923, "The Yellow Submarine"),
	VAL: club("Valencia", 74, 1919, "Los Che"),
	CLT: club("Celta", 56, 1923, "Los Celestes"),
	OSA: club("Osasuna", 50, 1920, "Los Rojillos"),
	GIR: club("Girona", 44, 1930, "Blanquivermells"),
	RAY: club("Rayo Vallecano", 46, 1924, "Los Franjirrojos"),
	GET: club("Getafe", 44, 1983, "Los Azulones"),
	ESP: club("Espanyol", 58, 1900, "Los Periquitos"),
	MLL: club("Mallorca", 50, 1916, "Los Bermellones"),
	ALA: club("Alavés", 46, 1921, "Babazorros"),
	LEV: club("Levante", 46, 1909, "Granotes"),
	ELC: club("Elche", 42, 1923, "Los Franjiverdes"),
	OVI: club("Real Oviedo", 48, 1926, "Los Carbayones"),
	// Spain, second tier
	DEP: club("Deportivo", 60, 1906, "Dépor"),
	ZAR: club("Real Zaragoza", 58, 1932, "Los Maños"),
	MAL: club("Málaga", 54, undefined, "Los Boquerones"),
	LPA: club("Las Palmas", 50, 1949, "Los Amarillos"),
	VLL: club("Real Valladolid", 50, 1928, "Pucela"),
	SPG: club("Sporting", 52, 1905, "Los Rojiblancos"),
	RAC: club("Racing", 50, 1913, "Los Racinguistas"),
	GRA: club("Granada", 46, 1931, "Los Nazaríes"),
	CAD: club("Cádiz", 44, 1910, "El Submarino Amarillo"),
	ALM: club("Almería", 40, 1989, "Los Rojiblancos"),
	LEG: club("Leganés", 38, 1928, "Los Pepineros"),
	EIB: club("Eibar", 38, 1940, "Los Armeros"),
	HUE: club("Huesca", 32, 1960),
	COR: club("Córdoba", 40, 1954, "Los Califas"),
	ALB: club("Albacete", 36, 1940, "El Queso Mecánico"),
	BRG: club("Burgos", 36),
	CAS: club("Castellón", 36, 1922, "Orelluts"),
	CUL: club("Cultural", 30, 1923),
	MIR: club("Mirandés", 28, 1927, "Los Jabatos"),
	CEU: club("Ceuta", 22),

	// Germany, first tier
	FCB: club("Bayern Munich", 96, 1900, "Die Roten"),
	B04: club("Bayer Leverkusen", 74, 1904, "Die Werkself"),
	BVB: club("Borussia Dortmund", 86, 1909, "Die Schwarzgelben"),
	RBL: club("RB Leipzig", 66, 2009, "Die Roten Bullen"),
	SGE: club("Eintracht Frankfurt", 70, 1899, "Die Adler"),
	VFB: club("Stuttgart", 72, 1893, "Die Schwaben"),
	BMG: club("Borussia Mönchengladbach", 72, 1900, "Die Fohlen"),
	WOB: club("Wolfsburg", 60, 1945, "Die Wölfe"),
	SCF: club("Freiburg", 56, 1904),
	SVW: club("Werder Bremen", 70, 1899),
	M05: club("Mainz 05", 54, 1905, "Die Nullfünfer"),
	TSG: club("Hoffenheim", 52, 1899),
	FCA: club("Augsburg", 48, 1907),
	FCU: club("Union Berlin", 54, 1966, "Die Eisernen"),
	BOC: club("Bochum", 46, 1848, "Die Unabsteigbaren"),
	FCH: club("Heidenheim", 38, 1846),
	STP: club("St. Pauli", 50, 1910, "Die Kiezkicker"),
	KSV: club("Holstein Kiel", 36, 1900, "Die Störche"),
	KOE: club("Köln", 66, 1948, "Die Geißböcke"),
	HSV: club("Hamburger SV", 74, 1887, "Der Dino"),
	// Germany, second tier
	BSC: club("Hertha", 64, 1892, "Die Alte Dame"),
	S04: club("Schalke 04", 76, 1904, "Die Knappen"),
	F95: club("Fortuna Düsseldorf", 56, 1895),
	FCN: club("Nürnberg", 60, 1900, "Der Club"),
	H96: club("Hannover 96", 58, 1896),
	FCK: club("Kaiserslautern", 62, 1900, "Die Roten Teufel"),
	KSC: club("Karlsruher", 54, 1894),
	D98: club("Darmstadt 98", 44, 1898, "Die Lilien"),
	SCP: club("Paderborn 07", 40, 1907),
	EBS: club("Eintracht Braunschweig", 50, 1895, "Die Löwen"),
	FCM: club("Magdeburg", 44, 1965),
	HRO: club("Hansa Rostock", 48, 1965, "Die Kogge"),
	SGD: club("Dynamo Dresden", 50, 1953),
	SGF: club("Greuther Fürth", 42, 1903, "Das Kleeblatt"),
	SVE: club("Elversberg", 30, 1907),
	ARM: club("Arminia Bielefeld", 46, 1905),
	MSV: club("Duisburg", 48, 1902, "Die Zebras"),
	ALE: club("Alemannia Aachen", 44, 1900),
	RWE: club("Rot-Weiss Essen", 42, 1907),
	ENC: club("Energie Cottbus", 40, 1966),

	// USA, first tier
	NYY: club("New York", 95),
	BKN: club("Brooklyn", 88),
	NYI: club("New York", 62),
	LAB: club("Los Angeles", 80),
	ANA: club("Anaheim", 60),
	CHI: club("Chicago", 82),
	DAL: club("Dallas", 90),
	HOU: club("Houston", 50),
	ATL: club("Atlanta", 72),
	WAS: club("Washington", 55),
	MIA: club("Miami", 66),
	PHI: club("Philadelphia", 72),
	PHX: club("Phoenix", 50),
	BOS: club("Boston", 45),
	SBH: club("San Bernardino", 30),
	SFS: club("San Francisco", 50),
	OAK: club("Oakland", 76),
	DET: club("Detroit", 72),
	SEA: club("Seattle", 66),
	MIN: club("Minneapolis", 35),
	// USA, second tier
	SDA: club("San Diego", 45),
	DEN: club("Denver", 48),
	ORL: club("Orlando", 32),
	CHA: club("Charlotte", 56),
	BAL: club("Baltimore", 30),
	STL: club("St. Louis", 80),
	SAS: club("San Antonio", 78),
	AUS: club("Austin", 70),
	POR: club("Portland", 30),
	SAC: club("Sacramento", 40),
	PIT: club("Pittsburgh", 86),
	LVR: club("Las Vegas", 58),
	CIN: club("Cincinnati", 68),
	KCA: club("Kansas City", 50),
	CLB: club("Columbus", 74),
	IND: club("Indianapolis", 72),
	NSH: club("Nashville", 30),
	CLE: club("Cleveland", 64),
	JAX: club("Jacksonville", 42),
	PVD: club("Providence", 26),
	// USA, third tier
	RAL: club("Raleigh", 74),
	MIL: club("Milwaukee", 48),
	OKC: club("Oklahoma City", 68),
	RIC: club("Richmond", 34),
	SLC: club("Salt Lake City", 30),
	FRE: club("Fresno", 40),
	BIR: club("Birmingham", 56),
	HFD: club("Hartford", 50),
	BUF: club("Buffalo", 72),
	ELP: club("El Paso", 24),
	OMA: club("Omaha", 64),
	HON: club("Honolulu", 40),
	NOL: club("New Orleans", 68),
	KNX: club("Knoxville", 66),
	BAK: club("Bakersfield", 22),
	ABQ: club("Albuquerque", 36),
	BOI: club("Boise", 48),
	VEN: club("Ventura", 20),
	LRK: club("Little Rock", 60),
	SPO: club("Spokane", 30),

	// Italy, first tier
	JUV: club("Juventus", 92, 1897, "La Vecchia Signora"),
	ACM: club("Milan", 90, 1899, "I Rossoneri"),
	INT: club("Inter", 90, 1908, "I Nerazzurri"),
	NAP: club("Napoli", 80, 1926, "Gli Azzurri"),
	ROM: club("Roma", 78, 1927, "I Giallorossi"),
	LAZ: club("Lazio", 72, 1900, "Le Aquile"),
	FIO: club("Fiorentina", 70, 1926, "La Viola"),
	ATA: club("Atalanta", 68, 1907, "La Dea"),
	TRO: club("Torino", 66, 1906, "Il Toro"),
	BOL: club("Bologna", 62, 1909, "I Rossoblù"),
	GEN: club("Genoa", 58, 1893, "Il Grifone"),
	UDI: club("Udinese", 56, 1896, "I Friulani"),
	SAM: club("Sampdoria", 62, 1946, "Il Doria"),
	PAR: club("Parma", 58, 1913, "I Ducali"),
	CAG: club("Cagliari", 52, 1920, "Gli Isolani"),
	VER: club("Hellas Verona", 52, 1903, "I Gialloblù"),
	LEC: club("Lecce", 46, 1908, "I Salentini"),
	SSU: club("Sassuolo", 44, 1920, "I Neroverdi"),
	COM: club("Como", 44, 1907, "I Lariani"),
	PIS: club("Pisa", 42, 1909, "I Nerazzurri"),
	CRE: club("Cremonese", 40, 1903, "La Cremo"),
	// Italy, second tier
	PAL: club("Palermo", 52, 1900, "I Rosanero"),
	VEZ: club("Venezia", 42, 1907, "Gli Arancioneroverdi"),
	MNZ: club("Monza", 42, 1912, "I Brianzoli"),
	SPE: club("Spezia", 40, 1906, "Gli Aquilotti"),
	BRI: club("Bari", 46, 1908, "I Galletti"),
	EMP: club("Empoli", 42, 1920, "Gli Azzurri"),
	FRO: club("Frosinone", 36, 1928, "I Canarini"),
	MOD: club("Modena", 40, 1912, "I Canarini"),
	CES: club("Cesena", 38, 1940, "I Cavallucci Marini"),
	CAT: club("Catanzaro", 34, 1929, "Le Aquile"),
	REG: club("Reggiana", 36, 1919, "La Regia"),
	PES: club("Pescara", 36, 1936, "Il Delfino"),
	PAD: club("Padova", 38, 1910, "I Biancoscudati"),
	AVE: club("Avellino", 32, 1912, "I Lupi"),
	SUD: club("Südtirol", 26, 1974),
	JST: club("Juve Stabia", 28, 1907, "Le Vespe"),
	MAN: club("Mantova", 30, 1911, "I Virgiliani"),
	CRR: club("Carrarese", 26, 1908, "Gli Azzurri"),
	ENT: club("Virtus Entella", 24, 1914, "I Diavoli Neri"),

	// Japan, first tier
	YOM: club("Yomiuri", 94),
	HAN: club("Hanshin", 86),
	SBK: club("SoftBank", 80),
	DNA: club("DeNA", 62),
	HIR: club("Hiroshima", 70),
	CHU: club("Chunichi", 70),
	YAK: club("Yakult", 64),
	NIP: club("Nippon-Ham", 66),
	SEI: club("Seibu", 70),
	LOT: club("Lotte", 60),
	ORI: club("Orix", 62),
	RAK: club("Rakuten", 56),
	URA: club("Urawa", 72),
	KSA: club("Kashima", 74),
	YFM: club("Yokohama", 66),
	KWF: club("Kawasaki", 62),
	GAM: club("Gamba", 64),
	CER: club("Cerezo", 54),
	VIS: club("Vissel", 58),
	FCT: club("FC", 56),
	// Japan, second tier
	SAN: club("Sanfrecce", 60),
	NGY: club("Nagoya", 56),
	CON: club("Consadole", 44),
	AVI: club("Avispa", 42),
	KSR: club("Kashiwa", 54),
	TOS: club("Sagan", 40),
	SPU: club("Shimizu", 52),
	JUB: club("Júbilo", 58),
	ALN: club("Albirex", 46),
	KYO: club("Kyoto", 46),
	VEG: club("Vegalta", 44),
	MON: club("Montedio", 34),
	KOF: club("Ventforet", 36),
	MAT: club("Matsumoto", 34),
	MAC: club("Machida", 38),
	SHO: club("Shonan", 42),
	OIT: club("Oita", 38),
	VVN: club("V-Varen", 32),
	ROA: club("Roasso", 30),
	VOR: club("Tokushima", 32),

	// Mexico, first tier
	DIA: club("Diablos Rojos", 88),
	SUL: club("Sultanes", 82),
	TQR: club("Tigres", 72),
	PER: club("Pericos", 64),
	LEO: club("Leones", 68),
	CHJ: club("Charros", 60),
	TOR: club("Toros", 66),
	ACE: club("Acereros", 58),
	SAR: club("Saraperos", 60),
	ALG: club("Algodoneros", 56),
	BRA: club("Bravos", 48),
	RIE: club("Rieleros", 52),
	NAR: club("Naranjeros", 76),
	TOM: club("Tomateros", 74),
	AME: club("Águilas", 70),
	VMZ: club("Venados", 66),
	CAN: club("Cañeros", 62),
	YAQ: club("Yaquis", 64),
	MAY: club("Mayos", 54),
	GUA: club("Algodoneros", 44),
	// Mexico, second tier
	PIR: club("Piratas", 48),
	OLM: club("Olmecas", 50),
	GUE: club("Guerreros", 46),
	AGV: club("El Águila", 58),
	DOR: club("Dorados", 44),
	MAR: club("Mariachis", 36),
	TEC: club("Tecolotes", 52),
	CQO: club("Conspiradores", 30),
	ZNO: club("Nopales", 20),
	DGO: club("Generales", 38),
	ANG: club("Ángeles", 30),
	ALI: club("Alijadores", 42),
	BRY: club("Broncos", 40),
	CHX: club("Chileros", 34),
	TUN: club("Tuneros", 44),
	CAF: club("Cafeteros", 36),
	PMI: club("Petroleros", 38),
	PPR: club("Petroleros", 40),
	DEL: club("Delfines", 36),
	CTP: club("Coras", 34),
};

// Every real club by abbreviation
let realClubsByAbbrev: Map<string, RealClub> | undefined;

/**
 * A club's real history, if it's the real club with that abbreviation, region,
 * and name. A club only sharing a real club's abbreviation and town, like one
 * of ZenGM's default teams, isn't that club.
 */
export const getRealClubHistory = ({
	abbrev,
	region,
	name,
}: {
	abbrev: string;
	region: string;
	name: string;
}) => {
	realClubsByAbbrev ??= new Map(
		WORLD_COUNTRIES.flatMap(
			(country) => country.realClubsByTier?.flat() ?? [],
		).map((club) => [club.abbrev, club]),
	);
	const realClub = realClubsByAbbrev.get(abbrev);
	const history = REAL_CLUB_HISTORY[abbrev];
	return realClub?.region === region &&
		realClub.name === name &&
		history?.region === region
		? history
		: undefined;
};

/** Gives a club a real club's founding year and nickname, if it has either */
export const applyRealClubIdentity = (
	t: Pick<Team, "worldIdentity">,
	real: RealClubHistory,
) => {
	if (real.founded !== undefined || real.nickname !== undefined) {
		t.worldIdentity = {
			...(real.founded !== undefined ? { founded: real.founded } : {}),
			...(real.nickname !== undefined ? { nickname: real.nickname } : {}),
		};
	}
};
