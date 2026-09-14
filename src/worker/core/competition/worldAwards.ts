import { defaultAwards } from "../../../common/defaultGameAttributes.ts";
import { bySport } from "../../../common/sportFunctions.ts";
import type { GameAttributesLeague } from "../../../common/types.ts";
import { omit } from "../../../common/utils.ts";

type AwardSetting = GameAttributesLeague["awards"][number];

/**
 * International Soccer Zen GM mod (Epic 6): each Division's own awards, like
 * each soccer league's player of the season, top scorer, and team of the
 * season (an All-Division team). They're ZenGM awards by division (the "div" group), since a World's
 * divs mirror its Divisions.
 */
export const getDivisionAwards = (): AwardSetting[] => [
	{
		// Not acting as the MVP, so a World's many Division MVPs don't all count
		// as MVPs on the Hall of Fame and records pages
		...omit(defaultAwards.mvp, ["actAs"]),
		group: "div",
	},
	{
		// The most points in total, like soccer's top scorer. Basketball award stats
		// are per game.
		...bySport<Pick<AwardSetting, "formula" | "showStats">>({
			baseball: { formula: "hr", showStats: "overall" },
			basketball: { formula: "pts * gp", showStats: "offense" },
			football: { formula: "rusTD + recTD", showStats: "overall" },
			hockey: { formula: "g", showStats: "overall" },
		}),
		shortName: "TS",
		name: "Top Scorer",
		group: "div",
	},
	{
		// ZenGM calls a one-team award "<name> Team"
		...defaultAwards.all,
		shortName: "ALD",
		name: "All-Division",
		numTeams: 1,
		group: "div",
	},
];

/**
 * A World's awards: each Division's own (see getDivisionAwards) in place of the
 * league MVP and All-League teams, and no playoff awards, since a World has no
 * playoffs. The rest of `awards` stay as they are.
 */
export const getWorldAwards = (awards: AwardSetting[]): AwardSetting[] => [
	...getDivisionAwards(),
	...awards.filter(
		(award) =>
			award.shortName !== defaultAwards.mvp.shortName &&
			award.shortName !== defaultAwards.all.shortName &&
			typeof award.statRange !== "number" &&
			award.statRange !== "playoffs",
	),
];
