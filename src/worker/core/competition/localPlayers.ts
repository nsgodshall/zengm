import { shuffle } from "../../../common/random.ts";
import type { PlayerWithoutKey } from "../../../common/types.ts";
import { generateFace } from "../../util/face.ts";
import { local } from "../../util/index.ts";
import { loadNames } from "../../util/loadNames.ts";
import { player } from "../index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getCountryNameByTid, getNumLocalPlayers } from "./nationality.ts";

const hasNames = async (country: string) => {
	if (local.playerBioInfo === undefined) {
		local.playerBioInfo = await loadNames();
	}
	return local.playerBioInfo.countries[country] !== undefined;
};

/** Gives a new player a name, birthplace, college, and face from `country` */
const makeFrom = async (p: PlayerWithoutKey, country: string) => {
	const info = await player.name(country);
	p.firstName = info.firstName;
	p.lastName = info.lastName;
	p.born.loc = info.country;
	p.college = info.college;
	p.face = generateFace({ race: info.race });
};

/**
 * In a World, makes about LOCAL_PLAYER_FRACTION of each club's new players,
 * picked at random, from the club's Country. Call it before the players are
 * saved or given relatives. Countries without names in playerBioInfo keep the
 * worldwide mix.
 */
export const makePlayersMostlyLocal = async (
	players: PlayerWithoutKey[],
	getClubTid: (p: PlayerWithoutKey) => number | undefined,
	teams: { tid: number; divisionId?: number }[],
) => {
	const structure = getCompetitionStructure();
	if (isSingleDivision(structure)) {
		return;
	}

	const countryNameByTid = getCountryNameByTid({
		countries: structure.countries,
		competitionDivisions: structure.competitionDivisions,
		teams,
	});

	const playersByTid = new Map<number, PlayerWithoutKey[]>();
	for (const p of players) {
		const tid = getClubTid(p);
		if (tid !== undefined) {
			playersByTid.set(tid, [...(playersByTid.get(tid) ?? []), p]);
		}
	}

	for (const [tid, clubPlayers] of playersByTid) {
		const country = countryNameByTid.get(tid);
		if (country === undefined || !(await hasNames(country))) {
			continue;
		}

		const shuffled = [...clubPlayers];
		shuffle(shuffled);
		for (const p of shuffled.slice(0, getNumLocalPlayers(clubPlayers.length))) {
			await makeFrom(p, country);
		}
	}
};
