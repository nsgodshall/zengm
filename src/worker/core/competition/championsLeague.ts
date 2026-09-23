import { helpers } from "../../../common/helpers.ts";

export type ChampionsLeagueQualifier = {
	tid: number;
	countryId: number;
	domesticPosition: number;
	countryCoefficient: number;
	seed: number;
};

export type ChampionsLeagueCountry = {
	countryId: number;
	coefficient: number;
	table: { tid: number }[];
};

export type ChampionsLeagueGroupGame = {
	groupId: number;
	matchday: number;
	homeTid: number;
	awayTid: number;
	homePts?: number;
	awayPts?: number;
};

export type ChampionsLeagueTableRow = {
	tid: number;
	played: number;
	points: number;
	pointDifferential: number;
	pointsFor: number;
	headToHeadPoints: number;
	domesticSeed: number;
};

export const getChampionsLeagueFieldSize = (numCountries: number) => {
	if (numCountries < 2 || numCountries > 7) {
		throw new Error(
			`Champions League requires 2 to 7 Countries, got ${numCountries}`,
		);
	}
	return numCountries <= 4 ? 8 : 16;
};

/**
 * Every Country receives champion and runner-up places. Extra places are
 * handed out one at a time in coefficient order, cycling through the Countries
 * until the field is full. This keeps qualification open while still making a
 * stronger Country's next finisher the first replacement.
 */
export const getChampionsLeagueQualifiers = (
	countries: ChampionsLeagueCountry[],
): ChampionsLeagueQualifier[] => {
	const fieldSize = getChampionsLeagueFieldSize(countries.length);
	const rankedCountries = [...countries].sort(
		(a, b) => b.coefficient - a.coefficient || a.countryId - b.countryId,
	);
	const selected: Omit<ChampionsLeagueQualifier, "seed">[] = [];
	const nextPositionByCountry = new Map<number, number>();

	for (const country of rankedCountries) {
		const automatic = country.table.slice(0, 2);
		for (const [index, club] of automatic.entries()) {
			selected.push({
				tid: club.tid,
				countryId: country.countryId,
				domesticPosition: index + 1,
				countryCoefficient: country.coefficient,
			});
		}
		nextPositionByCountry.set(country.countryId, automatic.length);
	}

	while (selected.length < fieldSize) {
		let added = false;
		for (const country of rankedCountries) {
			const position = nextPositionByCountry.get(country.countryId) ?? 0;
			const club = country.table[position];
			if (!club) {
				continue;
			}
			selected.push({
				tid: club.tid,
				countryId: country.countryId,
				domesticPosition: position + 1,
				countryCoefficient: country.coefficient,
			});
			nextPositionByCountry.set(country.countryId, position + 1);
			added = true;
			if (selected.length === fieldSize) {
				break;
			}
		}
		if (!added) {
			break;
		}
	}

	return selected
		.sort(
			(a, b) =>
				a.domesticPosition - b.domesticPosition ||
				b.countryCoefficient - a.countryCoefficient ||
				a.countryId - b.countryId ||
				a.tid - b.tid,
		)
		.map((qualifier, seed) => ({ ...qualifier, seed: seed + 1 }));
};

/** Deterministic protected draw; same-Country clubs are split when possible. */
export const drawChampionsLeagueGroups = (
	qualifiers: ChampionsLeagueQualifier[],
) => {
	if (qualifiers.length % 4 !== 0) {
		throw new Error(
			`Champions League needs four-club groups, got ${qualifiers.length} qualifiers`,
		);
	}
	const groups: ChampionsLeagueQualifier[][] = Array.from(
		{ length: qualifiers.length / 4 },
		() => [],
	);
	for (const qualifier of [...qualifiers].sort((a, b) => a.seed - b.seed)) {
		const candidates = groups
			.map((group, groupId) => ({
				group,
				groupId,
				protected: !group.some(
					(other) => other.countryId === qualifier.countryId,
				),
			}))
			.filter(({ group }) => group.length < 4)
			.sort(
				(a, b) =>
					Number(b.protected) - Number(a.protected) ||
					a.group.length - b.group.length ||
					a.groupId - b.groupId,
			);
		const target = candidates[0];
		if (!target) {
			throw new Error("Champions League group draw has no open group");
		}
		target.group.push(qualifier);
	}
	return groups;
};

const roundRobinRounds = (tids: number[]) => {
	if (tids.length !== 4) {
		throw new Error(`Expected a four-club group, got ${tids.length}`);
	}
	const rotating = [...tids];
	const rounds: [number, number][][] = [];
	for (let round = 0; round < rotating.length - 1; round++) {
		rounds.push([
			[rotating[0]!, rotating[3]!],
			[rotating[1]!, rotating[2]!],
		]);
		rotating.splice(1, 0, rotating.pop()!);
	}
	return rounds;
};

/** Six matchdays, home and away, with every club playing once per matchday. */
export const getChampionsLeagueGroupSchedule = (
	groups: ChampionsLeagueQualifier[][],
): ChampionsLeagueGroupGame[] => {
	const games: ChampionsLeagueGroupGame[] = [];
	for (const [groupId, group] of groups.entries()) {
		const firstHalf = roundRobinRounds(group.map((qualifier) => qualifier.tid));
		for (const [matchday, matchups] of firstHalf.entries()) {
			for (const [homeTid, awayTid] of matchups) {
				games.push(
					{ groupId, matchday, homeTid, awayTid },
					{
						groupId,
						matchday: matchday + 3,
						homeTid: awayTid,
						awayTid: homeTid,
					},
				);
			}
		}
	}
	return games;
};

export const getChampionsLeagueGroupTable = ({
	group,
	games,
}: {
	group: ChampionsLeagueQualifier[];
	games: ChampionsLeagueGroupGame[];
}): ChampionsLeagueTableRow[] => {
	const rowByTid = new Map(
		group.map((qualifier) => [
			qualifier.tid,
			{
				tid: qualifier.tid,
				played: 0,
				points: 0,
				pointDifferential: 0,
				pointsFor: 0,
				headToHeadPoints: 0,
				domesticSeed: qualifier.seed,
			},
		]),
	);
	for (const game of games) {
		if (game.homePts === undefined || game.awayPts === undefined) {
			continue;
		}
		const home = rowByTid.get(game.homeTid);
		const away = rowByTid.get(game.awayTid);
		if (!home || !away) {
			throw new Error("Champions League group result contains a non-member");
		}
		home.played += 1;
		away.played += 1;
		home.pointsFor += game.homePts;
		away.pointsFor += game.awayPts;
		home.pointDifferential += game.homePts - game.awayPts;
		away.pointDifferential += game.awayPts - game.homePts;
		if (game.homePts > game.awayPts) {
			home.points += 3;
		} else if (game.awayPts > game.homePts) {
			away.points += 3;
		} else {
			home.points += 1;
			away.points += 1;
		}
	}

	const base = [...rowByTid.values()].sort(
		(a, b) =>
			b.points - a.points ||
			b.pointDifferential - a.pointDifferential ||
			b.pointsFor - a.pointsFor ||
			a.domesticSeed - b.domesticSeed,
	);
	for (let start = 0; start < base.length;) {
		let end = start + 1;
		while (
			end < base.length &&
			base[end]!.points === base[start]!.points &&
			base[end]!.pointDifferential === base[start]!.pointDifferential &&
			base[end]!.pointsFor === base[start]!.pointsFor
		) {
			end += 1;
		}
		if (end - start > 1) {
			const tied = new Set(base.slice(start, end).map((row) => row.tid));
			for (const game of games) {
				if (
					game.homePts === undefined ||
					game.awayPts === undefined ||
					!tied.has(game.homeTid) ||
					!tied.has(game.awayTid)
				) {
					continue;
				}
				if (game.homePts > game.awayPts) {
					rowByTid.get(game.homeTid)!.headToHeadPoints += 3;
				} else if (game.awayPts > game.homePts) {
					rowByTid.get(game.awayTid)!.headToHeadPoints += 3;
				} else {
					rowByTid.get(game.homeTid)!.headToHeadPoints += 1;
					rowByTid.get(game.awayTid)!.headToHeadPoints += 1;
				}
			}
			base.splice(
				start,
				end - start,
				...base
					.slice(start, end)
					.sort(
						(a, b) =>
							b.headToHeadPoints - a.headToHeadPoints ||
							a.domesticSeed - b.domesticSeed,
					),
			);
		}
		start = end;
	}
	return base;
};

export type ChampionsLeagueKnockoutEntrant = {
	tid: number;
	seed: number;
	groupId: number;
	groupPosition: 1 | 2;
};

/** Group winners host runners-up; same-group rematches are avoided if possible. */
export const getChampionsLeagueFirstKnockoutRound = (
	entrants: ChampionsLeagueKnockoutEntrant[],
) => {
	const winners = entrants
		.filter((entrant) => entrant.groupPosition === 1)
		.sort((a, b) => a.seed - b.seed);
	const runners = entrants
		.filter((entrant) => entrant.groupPosition === 2)
		.sort((a, b) => b.seed - a.seed);
	if (winners.length !== runners.length) {
		throw new Error("Champions League knockout field is unbalanced");
	}
	return winners.map((winner) => {
		const index = runners.findIndex(
			(runner) => runner.groupId !== winner.groupId,
		);
		const [runner] = runners.splice(index >= 0 ? index : 0, 1);
		return { homeTid: winner.tid, awayTid: runner!.tid };
	});
};

export const getChampionsLeagueKnockoutWinner = ({
	homeTid,
	awayTid,
	homePts,
	awayPts,
	seedByTid,
}: {
	homeTid: number;
	awayTid: number;
	homePts: number;
	awayPts: number;
	seedByTid: Map<number, number>;
}) => {
	if (homePts !== awayPts) {
		return homePts > awayPts ? homeTid : awayTid;
	}
	return (seedByTid.get(homeTid) ?? Infinity) <
		(seedByTid.get(awayTid) ?? Infinity)
		? homeTid
		: awayTid;
};

export const getChampionsLeagueCountryCoefficients = ({
	seasons,
	currentSeason,
}: {
	seasons: { season: number; pointsByCountry: Record<number, number> }[];
	currentSeason: number;
}) => {
	const totals = new Map<number, number>();
	for (const season of seasons) {
		if (season.season < currentSeason - 4 || season.season > currentSeason) {
			continue;
		}
		for (const [countryId, points] of Object.entries(season.pointsByCountry)) {
			const id = Number(countryId);
			totals.set(id, (totals.get(id) ?? 0) + points);
		}
	}
	return totals;
};

export const getChampionsLeaguePrize = (
	stage: "entry" | "win" | "draw" | "advance" | "champion",
) =>
	({ entry: 1000, win: 250, draw: 100, advance: 750, champion: 2500 })[stage];

export const getCompletedGroupMatchday = (games: ChampionsLeagueGroupGame[]) =>
	helpers.bound(
		Math.min(
			...Array.from({ length: 6 }, (_, matchday) =>
				games
					.filter((game) => game.matchday === matchday)
					.every(
						(game) => game.homePts !== undefined && game.awayPts !== undefined,
					)
					? matchday + 1
					: matchday,
			),
		),
		0,
		6,
	);
