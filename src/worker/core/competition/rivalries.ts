import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 4): who a World club's rivals are. Clubs in the same town play a derby, and
// rivalries grow out of shared history: finishing first and second, going up
// or down together, and meeting in promotion playoffs. Shared history fades
// with time; a derby doesn't.

export const RIVALRY_SETTINGS = {
	derby: 5,
	titleRace: 4,
	movedTogether: 1.5,
	playoffMeeting: 2,
	// Shared history is worth this much less for each season since
	decay: 0.85,
	// A rivalry needs this much to count
	minScore: 3,
	maxRivals: 3,
};

export type RivalryReason =
	| { kind: "derby"; town: string }
	| { kind: "titleRace"; season: number }
	| { kind: "wentUp" | "wentDown"; season: number }
	| { kind: "playoffMeeting"; season: number };

export type RivalryClub = {
	tid: number;
	countryId: number;
	town?: string;
	history: WorldHistoryEntry[];
};

export type Rival = {
	tid: number;
	score: number;
	reasons: RivalryReason[];
};

const pairKey = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);

/**
 * Every club's rivals within its own Country as of `season`, strongest first,
 * from towns, histories, and promotion playoff games (each with its season and
 * both clubs)
 */
export const getRivalries = ({
	clubs,
	season,
	playoffGames = [],
}: {
	clubs: RivalryClub[];
	season: number;
	playoffGames?: { season: number; homeTid: number; awayTid: number }[];
}) => {
	const settings = RIVALRY_SETTINGS;
	const pairs = new Map<
		string,
		{ tids: [number, number]; score: number; reasons: RivalryReason[] }
	>();
	const clubsByTid = new Map(clubs.map((club) => [club.tid, club]));
	const add = (a: number, b: number, score: number, reason: RivalryReason) => {
		const clubA = clubsByTid.get(a);
		const clubB = clubsByTid.get(b);
		if (a === b || !clubA || !clubB || clubA.countryId !== clubB.countryId) {
			return;
		}
		const key = pairKey(a, b);
		let pair = pairs.get(key);
		if (!pair) {
			pair = { tids: [a, b], score: 0, reasons: [] };
			pairs.set(key, pair);
		}
		pair.score += score;
		pair.reasons.push(reason);
	};
	const faded = (points: number, eventSeason: number) =>
		points * settings.decay ** Math.max(0, season - eventSeason);

	for (const [i, a] of clubs.entries()) {
		for (const b of clubs.slice(i + 1)) {
			if (a.town !== undefined && a.town === b.town) {
				add(a.tid, b.tid, settings.derby, { kind: "derby", town: a.town });
			}
		}
	}

	const entriesByDivisionSeason = new Map<
		string,
		{ tid: number; entry: WorldHistoryEntry }[]
	>();
	for (const club of clubs) {
		for (const entry of club.history) {
			if (entry.season > season) {
				continue;
			}
			const key = `${entry.divisionId} ${entry.season}`;
			const list = entriesByDivisionSeason.get(key) ?? [];
			list.push({ tid: club.tid, entry });
			entriesByDivisionSeason.set(key, list);
		}
	}
	for (const entries of entriesByDivisionSeason.values()) {
		const first = entries.find(({ entry }) => entry.position === 1);
		const second = entries.find(({ entry }) => entry.position === 2);
		if (first && second) {
			add(
				first.tid,
				second.tid,
				faded(settings.titleRace, first.entry.season),
				{ kind: "titleRace", season: first.entry.season },
			);
		}
		for (const moved of ["promoted", "relegated"] as const) {
			const movers = entries.filter(({ entry }) => entry.moved === moved);
			for (const [i, a] of movers.entries()) {
				for (const b of movers.slice(i + 1)) {
					add(a.tid, b.tid, faded(settings.movedTogether, a.entry.season), {
						kind: moved === "promoted" ? "wentUp" : "wentDown",
						season: a.entry.season,
					});
				}
			}
		}
	}

	for (const game of playoffGames) {
		if (game.season <= season) {
			add(
				game.homeTid,
				game.awayTid,
				faded(settings.playoffMeeting, game.season),
				{ kind: "playoffMeeting", season: game.season },
			);
		}
	}

	const rivalsByTid = new Map<number, Rival[]>();
	for (const { tids, score, reasons } of pairs.values()) {
		if (score < settings.minScore) {
			continue;
		}
		for (const [tid, other] of [tids, [tids[1], tids[0]]] as const) {
			const rivals = rivalsByTid.get(tid) ?? [];
			rivals.push({ tid: other, score, reasons });
			rivalsByTid.set(tid, rivals);
		}
	}
	for (const [tid, rivals] of rivalsByTid) {
		rivalsByTid.set(
			tid,
			rivals
				.sort((a, b) => b.score - a.score || a.tid - b.tid)
				.slice(0, settings.maxRivals),
		);
	}
	return rivalsByTid;
};

/** A club's derby town with another club, if they're in the same town */
export const getDerbyTown = (rival: Rival) =>
	rival.reasons.find(
		(reason): reason is { kind: "derby"; town: string } =>
			reason.kind === "derby",
	)?.town;

/**
 * International Soccer Zen GM mod (storytelling, Phase 5): the last season two
 * clubs shared a Division, before `season`, or undefined if they never have.
 * Histories are their saved seasons (see recordWorldSeason).
 */
export const getLastMeeting = ({
	history,
	otherHistory,
	season,
}: {
	history: { season: number; divisionId: number }[];
	otherHistory: { season: number; divisionId: number }[];
	season: number;
}) => {
	const divisionBySeason = new Map(
		otherHistory.map((entry) => [entry.season, entry.divisionId]),
	);
	let last: number | undefined;
	for (const entry of history) {
		if (
			entry.season < season &&
			divisionBySeason.get(entry.season) === entry.divisionId &&
			(last === undefined || entry.season > last)
		) {
			last = entry.season;
		}
	}
	return last;
};

/**
 * Whether a meeting is worth marking: decided with the user, a derby is news
 * when it comes back, not every time it's played, so two clubs that met last
 * season are just playing each other again.
 */
export const isRivalryRenewed = ({
	lastMet,
	season,
}: {
	lastMet: number | undefined;
	season: number;
}) => lastMet === undefined || lastMet < season - 1;

/**
 * How a renewed rivalry reads: the derby's town when they share one, and how
 * long it's been.
 */
export const describeRivalryMeeting = ({
	derbyTown,
	lastMet,
}: {
	derbyTown?: string;
	lastMet?: number;
}) => {
	const what = derbyTown ? `${derbyTown} derby` : "rivalry";
	return lastMet === undefined
		? `The first ${what}`
		: `The ${what} is back, first since ${lastMet}`;
};
