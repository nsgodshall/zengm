import type { Country, Division } from "../../../common/types.ts";

/**
 * About this share of a club's players, in its first team and its academy, are
 * from its Country. The rest come from the worldwide mix of nationalities.
 */
export const LOCAL_PLAYER_FRACTION = 0.7;

/**
 * How many of a club's `numPlayers` should be from its Country. The fraction
 * rounds up or down at random, so even small groups, like a club's share of
 * one academy intake, average out to LOCAL_PLAYER_FRACTION.
 */
export const getNumLocalPlayers = (
	numPlayers: number,
	random: () => number = Math.random,
) => {
	const expected = numPlayers * LOCAL_PLAYER_FRACTION;
	const whole = Math.floor(expected);
	return whole + (random() < expected - whole ? 1 : 0);
};

/** The name of each club's Country, by tid. Clubs not in a Division are left out. */
export const getCountryNameByTid = ({
	countries,
	competitionDivisions,
	teams,
}: {
	countries: Country[];
	competitionDivisions: Division[];
	teams: { tid: number; divisionId?: number }[];
}) => {
	const countryNameById = new Map(
		countries.map((country) => [country.countryId, country.name]),
	);
	const countryIdByDivisionId = new Map(
		competitionDivisions.map((division) => [
			division.divisionId,
			division.countryId,
		]),
	);

	const countryNameByTid = new Map<number, string>();
	for (const t of teams) {
		if (t.divisionId === undefined) {
			continue;
		}
		const countryId = countryIdByDivisionId.get(t.divisionId);
		const name =
			countryId === undefined ? undefined : countryNameById.get(countryId);
		if (name !== undefined) {
			countryNameByTid.set(t.tid, name);
		}
	}

	return countryNameByTid;
};
