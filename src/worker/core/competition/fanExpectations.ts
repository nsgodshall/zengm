import type { WorldHistoryEntry } from "../../../common/types.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): what a World club's supporters are expecting this season, said in terms
// of its own history, so the board objective isn't the only thing riding on it.

export const FAN_EXPECTATION_SETTINGS = {
	// A wait this long is worth mentioning
	longWait: 5,
};

/**
 * What the fans expect, or undefined when the club's history says nothing
 * pointed. `history` is every season it has finished, oldest first; `tier` is
 * where it plays this season; `divisionName` names that tier's Division and
 * `topDivisionName` the Country's top one.
 */
export const getFanExpectation = ({
	history,
	tier,
	divisionName,
	topDivisionName,
}: {
	history: WorldHistoryEntry[];
	tier: number;
	divisionName: string;
	topDivisionName: string;
}) => {
	const sorted = [...history].sort((a, b) => a.season - b.season);
	const last = sorted.at(-1);
	if (!last) {
		return;
	}

	const settings = FAN_EXPECTATION_SETTINGS;

	// Just relegated
	if (last.moved === "relegated") {
		return `Down from the ${last.tier === 1 ? topDivisionName : "division above"}: the fans want to go straight back up.`;
	}

	// Just promoted, with how long the club waited to come back
	if (last.moved === "promoted") {
		const before = sorted.filter(
			(entry) => entry.season < last.season && entry.tier === tier,
		);
		const away = before.at(-1)
			? last.season - before.at(-1)!.season
			: undefined;
		if (away !== undefined && away >= settings.longWait) {
			return `Back in the ${divisionName} after ${away} seasons away.`;
		}
		return `Up from the division below: the fans will settle for staying up.`;
	}

	// Reigning champions, who stayed where they won it
	if (last.champion && last.tier === tier) {
		return `The fans expect the ${divisionName} title defended.`;
	}

	// A long wait to get back to the top tier
	if (tier > 1) {
		const lastTop = sorted.filter((entry) => entry.tier === 1).at(-1);
		const away = lastTop ? last.season + 1 - lastTop.season : undefined;
		if (away !== undefined && away >= settings.longWait) {
			return `${away} seasons since the club was in the ${topDivisionName}.`;
		}
		if (lastTop === undefined && sorted.length >= settings.longWait) {
			return `The club has never played in the ${topDivisionName}.`;
		}
		return;
	}

	// A long wait for a title in the top tier
	const lastTitle = sorted.filter((entry) => entry.champion).at(-1);
	const wait = lastTitle ? last.season + 1 - lastTitle.season : undefined;
	if (wait !== undefined && wait >= settings.longWait) {
		return `No title since ${lastTitle!.season}.`;
	}
	if (lastTitle === undefined && sorted.length >= settings.longWait) {
		return `The club has never won the ${topDivisionName}.`;
	}
};
