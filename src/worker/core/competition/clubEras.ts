import { helpers } from "../../../common/helpers.ts";
import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): a World club's history told as eras, the way a soccer club's is: an
// unbroken spell in one tier, what it won there, and how the spell ended.

export type ClubEra = {
	tier: number;
	divisionId: number;
	from: number;
	to: number;
	seasons: number;
	titles: number;
	// Its best and worst finishes in the tier, and the seasons they came
	best: { position: number; season: number };
	worst: { position: number; season: number };
	// How the spell ended. An era with no end is the one the club is living.
	ended?: "promoted" | "relegated";
};

/**
 * A club's eras, oldest first: each unbroken run of seasons in one tier. A gap
 * in its history (seasons it didn't play) starts a new era, since what happened
 * in between isn't known.
 */
export const getClubEras = (history: WorldHistoryEntry[]): ClubEra[] => {
	const sorted = [...history].sort((a, b) => a.season - b.season);
	const eras: ClubEra[] = [];

	for (const [i, entry] of sorted.entries()) {
		const previous = sorted[i - 1];
		const era = eras.at(-1);
		const carriesOn =
			era !== undefined &&
			previous !== undefined &&
			previous.season === entry.season - 1 &&
			previous.tier === entry.tier;

		if (!era || !carriesOn) {
			eras.push({
				tier: entry.tier,
				divisionId: entry.divisionId,
				from: entry.season,
				to: entry.season,
				seasons: 1,
				titles: entry.champion ? 1 : 0,
				best: { position: entry.position, season: entry.season },
				worst: { position: entry.position, season: entry.season },
				...(entry.moved ? { ended: entry.moved } : {}),
			});
			continue;
		}

		era.divisionId = entry.divisionId;
		era.to = entry.season;
		era.seasons += 1;
		era.titles += entry.champion ? 1 : 0;
		if (entry.position < era.best.position) {
			era.best = { position: entry.position, season: entry.season };
		}
		if (entry.position > era.worst.position) {
			era.worst = { position: entry.position, season: entry.season };
		}
		if (entry.moved) {
			era.ended = entry.moved;
		} else {
			delete era.ended;
		}
	}

	return eras;
};

/**
 * How an era reads: the seasons it covers, and what the club did with them.
 * `divisionName` is the tier's Division in the club's Country.
 */
export const describeClubEra = ({
	era,
	divisionName,
}: {
	era: ClubEra;
	divisionName: string;
}) => {
	const span = era.from === era.to ? `${era.from}` : `${era.from}–${era.to}`;
	const parts = [
		`${era.seasons} ${era.seasons === 1 ? "season" : "seasons"} in the ${divisionName}`,
	];

	if (era.titles > 0) {
		parts.push(`${era.titles} ${era.titles === 1 ? "title" : "titles"}`);
	} else {
		parts.push(`best ${helpers.ordinal(era.best.position)}`);
	}
	if (era.ended) {
		parts.push(era.ended === "promoted" ? "went up" : "went down");
	}

	return { span, text: parts.join(", ") };
};
