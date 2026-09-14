import type { Conf, Div, Player } from "../../../common/types.ts";
import type { ExhibitionTeam } from "../Exhibition.tsx";

// Keep in sync with BASIC_TEAM_KEYS
export type NewLeagueTeam = {
	tid: number;
	region: string;
	name: string;
	abbrev: string;
	pop: number;
	popRank: number;
	stadiumCapacity?: number;
	imgURL?: string;
	imgURLSmall?: string;
	colors?: [string, string, string];
	srID?: string;
	disabled?: boolean;
	jersey?: string;
	cid: number;
	did: number;

	// International Soccer Zen GM mod (Epic 7): set for a new World's clubs
	divisionId?: number;
	location?: {
		town: string;
		country: string;
		wikipedia: string;
	};

	// From UpsertTeamModal
	players?: Player[];
	usePlayers?: boolean;
	seasonInfo?: ExhibitionTeam["seasonInfo"];
	season?: number;
};

export type NewLeagueTeamWithoutRank = Omit<NewLeagueTeam, "popRank">;

export type LeagueInfo = {
	startingSeason: number;
	stores: string[];
	gameAttributes: Record<string, unknown> & {
		confs: Conf[];
		divs: Div[];
	};
	teams: NewLeagueTeamWithoutRank[];
};
