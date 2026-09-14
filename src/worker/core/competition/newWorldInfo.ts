import { helpers } from "../../util/index.ts";
import { getLegacyConfsDivs } from "./competitionStructure.ts";
import {
	generateWorld,
	MAX_CLUBS_PER_DIVISION,
	MIN_CLUBS_PER_DIVISION,
	PILOT_CLUBS_PER_DIVISION,
} from "./pilotWorld.ts";
import {
	DEFAULT_WORLD_COUNTRY_KEYS,
	WORLD_COUNTRIES,
} from "./worldCountries.ts";

/**
 * International Soccer Zen GM mod (Epic 7): what the New World page needs to
 * create a World of the Countries in `countryKeys`, with `clubsPerDivision`
 * clubs in each Division: its clubs and competition structure, and the options
 * the page can change
 */
export const getWorldNewLeagueInfo = ({
	countryKeys = DEFAULT_WORLD_COUNTRY_KEYS,
	clubsPerDivision = PILOT_CLUBS_PER_DIVISION,
}: {
	countryKeys?: string[];
	clubsPerDivision?: number;
} = {}) => {
	const { structure, clubs } = generateWorld({ countryKeys, clubsPerDivision });
	const { confs, divs } = getLegacyConfsDivs(structure);

	return {
		confs,
		divs,
		gameAttributes: structure,
		teams: helpers.addPopRank(clubs),
		options: {
			countries: WORLD_COUNTRIES.map(({ key, name, numTiers }) => ({
				key,
				name,
				numTiers,
			})),
			countryKeys: structure.countries.map(
				(country) => WORLD_COUNTRIES.find((c) => c.name === country.name)!.key,
			),
			clubsPerDivision,
			minClubsPerDivision: MIN_CLUBS_PER_DIVISION,
			maxClubsPerDivision: MAX_CLUBS_PER_DIVISION,
		},
	};
};
