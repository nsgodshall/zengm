// International Soccer Zen GM mod (Epic 7): blazons for the USA's club crests,
// written with the user, in tier order to match competition/americanClubs.ts.
// tools/generate-crests.js turns each one into an image prompt.
//
// `slug` is the file the crest is saved as, `colors` the club's kit colors, in
// words the image model understands, and `blazon` the crest itself.
//
// Decided with the user: a date on a crest is the year the club was founded,
// made up but plausible for its city, never the year the city itself was
// founded. The old clubs of the big eastern and midwestern cities date from the
// 1880s and 1890s, the western ones from the 1900s to the 1930s, and the sunbelt
// clubs from the 1940s on.

export const CREST_BLAZONS = [
	// Top tier
	{
		slug: "new-york-yankees",
		club: "New York Yankees",
		colors: "azure #0c2340, grey #c4ced3, argent white",
		blazon:
			'Azure, an eagle displayed argent, in chief a mullet or; in base a scroll argent inscribed "N.Y. · MDCCCXCI" azure.',
	},
	{
		slug: "brooklyn-dodgers",
		club: "Brooklyn Dodgers",
		colors: "azure #113388, gules #dd1133, or gold",
		blazon:
			'Azure, a trolley car or in fess, dodged by a bridge of two towers argent in chief; in base a scroll or inscribed "B.D.F.C. · 1894" azure.',
	},
	{
		slug: "new-york-islanders",
		club: "New York Islanders",
		colors: "azure #00539b, tenné orange #f47d30, argent white",
		blazon:
			'Per pale azure and tenné, a lighthouse argent, its beam issuant bendwise or; in base three barrulets wavy argent and a scroll argent inscribed "N.Y.I. · A.D. 1912" sable; on a chief azure four mullets or.',
	},
	{
		slug: "los-angeles-bruins",
		club: "Los Angeles Bruins",
		colors: "azure #2774ae, or #ffd100",
		blazon:
			'Quarterly azure and paly or and azure, a bear\'s head couped affronté or, laureate vert; in base a scroll or inscribed "L.A.B. · MCMXIX" azure; within a bordure cabled or.',
	},
	{
		slug: "anaheim-angels",
		club: "Anaheim Angels",
		colors: "gules #ba0021, azure #003263, or gold",
		blazon:
			'Gules, a wing displayed argent enclosing an annulet or; in the four quarters as many blossoms or; within a bordure engrailed azure inscribed "IN EXCELSIS · 1924" or.',
	},
	{
		slug: "chicago-bears",
		club: "Chicago Bears",
		colors: "azure #0b162a, tenné orange #e64100, argent white",
		blazon:
			"Azure, a bear passant tenné before a wall embattled argent; on a chief azure four mullets of six points gules; in base the numerals 1837 argent.",
	},
	{
		slug: "dallas-cowboys",
		club: "Dallas Cowboys",
		colors: "azure #002244, argent silver #869397",
		blazon:
			'Per pale azure and argent, a mullet of five points argent between two longhorns fesswise or; in base a scroll azure inscribed "D.C.F.C. · 1901" argent; within a bordure argent.',
	},
	{
		slug: "houston-colt-45s",
		club: "Houston Colt .45s",
		colors: "azure #12284b, tenné orange #eb6e1f, argent white",
		blazon:
			"Per fess azure and tenné, a colt rampant argent, behind it a derrick sable; on a chief azure a mullet of six points or between the letters H and C argent; in base the numerals 1836 argent; within a bordure sable bezanty.",
	},
	{
		slug: "atlanta-braves",
		club: "Atlanta Braves",
		colors: "azure #13274f, gules #ce1141, argent white",
		blazon:
			'Azure, a phoenix rising from flames gules, wings displayed; in base a scroll argent inscribed "RESURGENS" sable; on a chief argent five mullets azure.',
	},
	{
		slug: "washington-senators",
		club: "Washington Senators",
		colors: "gules #ab0003, azure #14225a, argent white",
		blazon:
			'Paly gules and azure, a domed rotunda argent issuant into the chief, between two branches of laurel vert; in base a scroll argent inscribed "S.P.Q.W. · MDCCCXCIII" sable.',
	},
	{
		slug: "miami-hurricanes",
		club: "Miami Hurricanes",
		colors: "tenné orange #f47321, vert #005030, argent white",
		blazon:
			'Vert, a spiral of wind tenné, in the eye thereof an ibis argent; in base two palm fronds in saltire vert and a scroll argent inscribed "A.D. 1931" vert.',
	},
	{
		slug: "philadelphia-phillies",
		club: "Philadelphia Phillies",
		colors: "gules #c81e3b, azure #013b73, argent white",
		blazon:
			'Gules, a bell argent cracked bendwise, crowned of a chief azure; in base a scroll argent inscribed "PHILADELPHIA MANETO · MDCCCLXXXIII" gules.',
	},
	{
		slug: "phoenix-sun-devils",
		club: "Phoenix Sun Devils",
		colors: "purpure maroon #8c1d40, or #ffc627",
		blazon:
			'Purpure, a sun in splendour or, thereon a phoenix rising sable, in its claw a trident or; in base a scroll or inscribed "EX CINERIBUS · 1946" purpure.',
	},
	{
		slug: "boston-minutemen",
		club: "Boston Minutemen",
		colors: "gules #c8102e, azure #0c2340, argent white",
		blazon:
			'Azure, two muskets in saltire proper surmounted by a tricorn sable; in base sinister a powder horn or and a scroll argent inscribed "MDCCCLXXXVII"; on a chief gules thirteen roundels argent.',
	},
	{
		slug: "san-bernardino-highlanders",
		club: "San Bernardino Highlanders",
		colors: "azure #1b365d, or #c69214, argent white",
		blazon:
			'Azure, three mountains argent, that in the centre snow-capped, before them a thistle or; in base a fess chequy or and azure; within a bordure cabled or inscribed "NEMO ME IMPUNE" azure.',
	},
	{
		slug: "san-francisco-seals",
		club: "San Francisco Seals",
		colors: "sable #222222, grey #999999, argent white",
		blazon:
			'Sable, a sea lion sejant argent upon a rock, behind it an arch grey issuant from fog argent; in base a scroll argent inscribed "S.F. · 1903" sable.',
	},
	{
		slug: "oakland-raiders",
		club: "Oakland Raiders",
		colors: "sable black, argent silver #a5acaf",
		blazon:
			'Sable, two cutlasses in saltire argent surmounted by a ship\'s prow argent; in base an anchor argent; within an annulet sable bezanty argent inscribed "OAKLAND · A.D. 1913".',
	},
	{
		slug: "detroit-tigers",
		club: "Detroit Tigers",
		colors: "azure #0c2c56, tenné orange #fa4616, argent white",
		blazon:
			'Azure, a tiger passant tenné before a wheel of eight spokes argent; in base a scroll argent inscribed "SPERAMUS MELIORA" azure.',
	},
	{
		slug: "seattle-sonics",
		club: "Seattle Sonics",
		colors: "vert #005831, or #ffc121, argent white",
		blazon:
			"Vert, a tower argent, a disc at its summit, environed of three annulets or; in base a ferry argent; on a chief vert a fir tree or between the numerals 18 and 51 argent.",
	},
	{
		slug: "minneapolis-thunder",
		club: "Minneapolis Thunder",
		colors: "azure #0b2e5c, argent pale blue #8fc4e8, or gold",
		blazon:
			'Per fess azure and argent, in chief a thunderbolt or issuant from a cloud argent, in base a lake barry wavy azure and argent, on the shore a silo or and a scroll or inscribed "TONITRUS" sable; within a bordure azure bezanty.',
	},

	// Second tier
	{
		slug: "san-diego-aztecs",
		club: "San Diego Aztecs",
		colors: "gules #c41230, sable black, argent white",
		blazon:
			'Gules, a sun in splendour argent, in base a pyramid of five steps or between two feathers argent and a scroll or inscribed "A.D. MCMXXVIII"; within a bordure embattled sable.',
	},
	{
		slug: "denver-buffaloes",
		club: "Denver Buffaloes",
		colors: "sable black, or #cfb87c",
		blazon:
			'Sable, a bison courant or before mountains indented or; in base a scroll sable inscribed "A.D. 1908" or; on a chief or the numerals 5280 sable.',
	},
	{
		slug: "orlando-orange",
		club: "Orlando Orange",
		colors: "tenné orange #f47321, azure #0b2265, or gold",
		blazon:
			'Tenné, an orange slice or between two palm fronds vert; in base an alligator vert; within a bordure azure bezanty inscribed "ORLANDO · MCMLXII" or.',
	},
	{
		slug: "charlotte-hornets",
		club: "Charlotte Hornets",
		colors: "purpure #1d1160, vert teal #00788c, or gold",
		blazon:
			'Purpure semé of hexagons vert, a hornet volant or; in base a scroll or inscribed "A.D. 1949" purpure; on a chief vert three hexagons purpure.',
	},
	{
		slug: "baltimore-crabs",
		club: "Baltimore Crabs",
		colors: "tenné orange #df4601, sable black, gules red",
		blazon:
			'Per pale sable and tenné, a crab gules, its dexter claw grasping an oar or; in base a lighthouse argent and a scroll sable inscribed "B.C.F.C. · 1889" or.',
	},
	{
		slug: "st-louis-cardinals",
		club: "St. Louis Cardinals",
		colors: "gules #c41e3a, azure #0c2340, or #fedb00",
		blazon:
			"Gules, a cardinal perched upon a branch or, in chief a fleur-de-lis or; in base an arch or and the numerals 1764 argent.",
	},
	{
		slug: "san-antonio-spurs",
		club: "San Antonio Spurs",
		colors: "sable black, argent silver #c4ced4",
		blazon:
			"Sable, a spur rowel argent of eight points, behind it a mission facade argent of three bells; in base a river barry wavy argent and sable, and the numerals 1718 argent.",
	},
	{
		slug: "austin-longhorns",
		club: "Austin Longhorns",
		colors: "tenné burnt orange #bf5700, sable charcoal #333f48, or gold",
		blazon:
			'Tenné, a longhorn\'s head cabossed sable, horns extended throughout; on a chief tenné a capitol dome or; in base a scroll or inscribed "A.D. 1916" sable.',
	},
	{
		slug: "portland-roses",
		club: "Portland Roses",
		colors: "azure #002255, argent pale blue #6699cc, gules red",
		blazon:
			'Azure goutty argent, a rose gules barbed and seeded proper, slipped and thorned vert; in base a bridge argent and a scroll argent inscribed "URBS ROSARUM" azure.',
	},
	{
		slug: "sacramento-bears",
		club: "Sacramento Bears",
		colors: "gules #cc2244, azure #1c2c5b, argent white",
		blazon:
			'Gules, a bear passant sable upon a compartment vert, before two rivers conjoined argent; in base a scroll argent inscribed "S.B.F.C. · 1902" gules.',
	},
	{
		slug: "pittsburgh-steelers",
		club: "Pittsburgh Steelers",
		colors: "sable #101820, or #ffb612, argent white",
		blazon:
			'Sable, three bridges or in pale spanning as many rivers argent; on a chief or a hammer and anvil sable; in base a scroll or inscribed "BENIGNO NUMINE · MDCCCXCVI" sable.',
	},
	{
		slug: "las-vegas-runnin-rebels",
		club: "Las Vegas Runnin' Rebels",
		colors: "gules #cf0a2c, grey #666666, argent white",
		blazon:
			'Gules, a vaquero\'s head couped in profile argent, moustached, hatted sable; in base a horseshoe or reversed and a scroll argent inscribed "L.V. · A.D. 1958" gules; within a bordure grey embattled.',
	},
	{
		slug: "cincinnati-reds",
		club: "Cincinnati Reds",
		colors: "gules #c6011f, sable black, or gold",
		blazon:
			'Gules, a plough or, thereon a winged hog argent; in base a scroll or inscribed "JUNCTA JUVANT · MDCCCLXXXI" gules.',
	},
	{
		slug: "kansas-city-athletics",
		club: "Kansas City Athletics",
		colors: "vert #003831, or #efb21e",
		blazon:
			"Vert, an elephant statant or, trunk elevated, caparisoned barry or and vert; on a chief or a mullet vert between the letters K and C sable; in base a fountain proper.",
	},
	{
		slug: "columbus-buckeyes",
		club: "Columbus Buckeyes",
		colors: "gules #bb0000, grey #666666, or gold",
		blazon:
			"Gules, a buckeye leaf of five lobes or, fructed proper; on a chief grey the letters C.B.F.C. gules; in base the numerals 1812 or.",
	},
	{
		slug: "indianapolis-hoosiers",
		club: "Indianapolis Hoosiers",
		colors: "gules crimson #990000, argent white, or gold",
		blazon:
			'Gules, a torch argent enflamed or, environed of thirteen mullets argent in orle; in base a scroll argent inscribed "A.D. MCMV" gules.',
	},
	{
		slug: "nashville-stars",
		club: "Nashville Stars",
		colors: "azure #0c2340, gules #c8102e, or gold",
		blazon:
			"Azure, a mullet of five points or charged with a guitar's head sable, three pegs argent; in base two notes or and the numerals 1779 argent; within a double annulet or.",
	},
	{
		slug: "cleveland-spiders",
		club: "Cleveland Spiders",
		colors: "azure #0c2340, gules #e31937, argent white",
		blazon:
			'Azure, a spider sable upon a web argent throughout, in chief a lighthouse argent; in base a bridge of three arches gules and a scroll argent inscribed "CLEVELAND · 1887" azure.',
	},
	{
		slug: "jacksonville-gamecocks",
		club: "Jacksonville Gamecocks",
		colors: "gules garnet #73000a, sable black, or gold",
		blazon:
			'Sable, a cock statant gules, combed and wattled or, armed with a spur or; in base a bascule bridge or and a scroll or inscribed "J.G.F.C. · 1968" sable.',
	},
	{
		slug: "providence-sailors",
		club: "Providence Sailors",
		colors: "azure #0c2340, or old gold #b9975b, argent white",
		blazon:
			'Azure, an anchor and a ship\'s wheel in saltire or; in chief dexter a sextant or; in base barry wavy argent and azure; within a bordure cabled or inscribed "SPES · MDCCCXCVIII" azure.',
	},

	// Third tier
	{
		slug: "raleigh-tar-heels",
		club: "Raleigh Tar Heels",
		colors: "azure carolina blue #7bafd4, azure navy #13294b, or gold",
		blazon:
			'Azure, a longleaf pine or between two barrulets argent; in base a footprint sable and a scroll or inscribed "ESSE QUAM VIDERI" azure; on a chief azure the numerals 1792 or.',
	},
	{
		slug: "milwaukee-badgers",
		club: "Milwaukee Badgers",
		colors: "gules #c5050c, argent white, or gold",
		blazon:
			'Gules, a badger\'s head couped affronté argent, masked sable; in base two ears of barley in saltire or and a scroll argent inscribed "M.B.F.C. · 1893" gules.',
	},
	{
		slug: "oklahoma-city-sooners",
		club: "Oklahoma City Sooners",
		colors: "gules crimson #841617, cream #fdf9d8, or gold",
		blazon:
			'Gules, a covered wagon or in full career, behind it a sun in splendour or; in base a scroll or inscribed "MCMVII" gules.',
	},
	{
		slug: "richmond-redtails",
		club: "Richmond Redtails",
		colors: "gules #990000, azure #0c2340, argent white",
		blazon:
			'Gules, a red-tailed hawk volant argent, its tail gules, grasping a tobacco leaf or; in chief a scroll argent inscribed "R.R.F.C."; in base the numerals 1911 argent.',
	},
	{
		slug: "salt-lake-city-pioneers",
		club: "Salt Lake City Pioneers",
		colors: "gules #cc0000, argent white, or gold",
		blazon:
			'Gules, a handcart argent before mountains argent; in chief dexter a seagull argent; on a chief or a beehive proper between the numerals 18 and 47 gules; in base a scroll or inscribed "INDUSTRIA".',
	},
	{
		slug: "fresno-bulldogs",
		club: "Fresno Bulldogs",
		colors: "gules #c41230, azure #13284c, argent white",
		blazon:
			'Gules, a bulldog\'s head couped affronté argent, collared azure; in base a bunch of grapes purpure and a scroll argent inscribed "A.D. 1921" gules.',
	},
	{
		slug: "birmingham-elephants",
		club: "Birmingham Elephants",
		colors: "gules crimson #9e1b32, grey #828a8f, argent white",
		blazon:
			'Gules, an elephant statant grey, before it a smith proper bearing hammer and anvil; in base a scroll grey inscribed "A.D. 1899" gules.',
	},
	{
		slug: "hartford-whalers",
		club: "Hartford Whalers",
		colors: "vert #00754a, azure #162d53, argent white",
		blazon:
			'Vert, a whale naiant argent before an oak tree or; in base a scroll argent inscribed "QUI TRANSTULIT SUSTINET" vert.',
	},
	{
		slug: "buffalo-bills",
		club: "Buffalo Bills",
		colors: "azure #00338d, gules #c60c30, argent white",
		blazon:
			'Azure, a bison passant gules before a grain elevator argent; in base three barrulets wavy argent and a scroll argent inscribed "B.B.F.C. · 1890" azure.',
	},
	{
		slug: "el-paso-vaqueros",
		club: "El Paso Vaqueros",
		colors: "tenné orange #ff8200, azure #041e42, or gold",
		blazon:
			'Tenné, a sombrero sable over a lasso coiled or, behind it a sun in splendour or; in base a cactus vert, a rail fesswise sable, and a scroll or inscribed "EL PASO DEL NORTE · 1934"; within a bordure indented azure.',
	},
	{
		slug: "omaha-cornhuskers",
		club: "Omaha Cornhuskers",
		colors: "gules #d00000, sable black, or gold",
		blazon:
			'Gules, two ears of maize in saltire or, husked proper; in base a river barry wavy argent and gules and a scroll or inscribed "O.C.F.C. · 1899" gules.',
	},
	{
		slug: "honolulu-rainbow-warriors",
		club: "Honolulu Rainbow Warriors",
		colors: "vert #024731, argent white, rainbow proper",
		blazon:
			'Vert, a rainbow throughout proper issuant from a sea barry wavy argent and vert, behind a headland sable; in base a scroll argent inscribed "UA MAU KE EA · 1947" vert.',
	},
	{
		slug: "new-orleans-jazz",
		club: "New Orleans Jazz",
		colors: "purpure #461d7c, or #fdd023, argent white",
		blazon:
			"Purpure, a cornet bendwise or, between in chief two fleurs-de-lis or; in base a crescent argent and the numerals 1923 or.",
	},
	{
		slug: "knoxville-volunteers",
		club: "Knoxville Volunteers",
		colors: "tenné orange #ff8200, grey #58595b, argent white",
		blazon:
			'Tenné, a powder horn or slung upon a ridge of mountains grey, smoke issuant argent; in base a scroll or inscribed "K.V.F.C. · MCMXI" sable.',
	},
	{
		slug: "bakersfield-mavericks",
		club: "Bakersfield Mavericks",
		colors: "azure #0033a0, or #ffc72c, sable black",
		blazon:
			'Azure, a steer\'s head cabossed or, unbranded, between two derricks sable; in base a scroll or inscribed "A.D. 1937" azure.',
	},
	{
		slug: "albuquerque-isotopes",
		club: "Albuquerque Isotopes",
		colors: "gules #ba0c2f, or #f2a900, vert green",
		blazon:
			'Gules, an atom or, its three orbits ellipsed, the first charged with a balloon or; in base a chile pepper vert and a scroll gules inscribed "A.D. MCMLII" or.',
	},
	{
		slug: "boise-broncos",
		club: "Boise Broncos",
		colors: "azure #0033a0, tenné orange #d64309, argent white",
		blazon:
			'Azure, a horse\'s head couped argent, maned tenné, rearing; in base a stand of three trees vert and a scroll argent inscribed "B.B. · 1943" azure.',
	},
	{
		slug: "ventura-pacifics",
		club: "Ventura Pacifics",
		colors: "azure #006ba6, or #f2a900, argent white",
		blazon:
			"Azure, a sun in splendour or setting behind a sea barry wavy argent and azure; in base a pier or upon pilings and the numerals 1782 or; in chief sinister a seagull argent.",
	},
	{
		slug: "little-rock-razorbacks",
		club: "Little Rock Razorbacks",
		colors: "gules cardinal #9d2235, argent white",
		blazon:
			'Gules, a boar passant argent, tusked and bristled; in base a rock proper upon a river barry wavy argent and gules, and a scroll argent inscribed "LA PETITE ROCHE · MCMIV" gules.',
	},
	{
		slug: "spokane-beavers",
		club: "Spokane Beavers",
		colors: "azure #1c2c5b, gules #cc2244, argent white",
		blazon:
			'Azure, a beaver proper gnawing a log or before a waterfall argent over rocks; in chief sinister a clock tower argent; in base two logs in saltire or and a scroll argent inscribed "S.B.F.C. · 1907" sable.',
	},
];
