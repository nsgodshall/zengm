import {
	defaultAwards,
	defaultGameAttributes,
} from "../../../common/defaultGameAttributes.ts";
import { bySport } from "../../../common/sportFunctions.ts";
import type { GameAttributesLeague } from "../../../common/types.ts";
import { omit } from "../../../common/utils.ts";

type AwardSetting = GameAttributesLeague["awards"][number];

// A player this old or younger in a season can be a Division's Young Player of
// the Season, like the Premier League's award for players under 23 at the start
// of the season
export const YOUNG_PLAYER_MAX_AGE = 22;

const YOUNG_PLAYER_SHORT_NAME = "YPS";

/**
 * Takes players older than YOUNG_PLAYER_MAX_AGE out of the running for an award.
 * Award formulas have no comparisons, so min and max turn age into 0 for a young
 * player and 1 for anyone older, whose score drops far below any young player's.
 */
const onlyYoungPlayers = (formula: string) =>
	`(${formula}) - 10000 * min(max(age - ${YOUNG_PLAYER_MAX_AGE}, 0), 1)`;

/**
 * International Soccer Zen GM mod (Epic 6): each Division's own awards, like
 * each soccer league's player of the season, top scorer, young player of the
 * season, and team of the season (an All-Division team). They're ZenGM awards
 * by division (the "div" group), since a World's divs mirror its Divisions.
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
		// The Division MVP among young players. Not acting as the Rookie of the
		// Year, for the same reason as the MVP.
		...omit(defaultAwards.mvp, ["actAs"]),
		formula: onlyYoungPlayers(defaultAwards.mvp.formula),
		...(defaultAwards.mvp.formulaByPos
			? {
					formulaByPos: Object.fromEntries(
						Object.entries(defaultAwards.mvp.formulaByPos).map(
							([pos, formula]) => [pos, onlyYoungPlayers(formula)],
						),
					),
				}
			: {}),
		shortName: YOUNG_PLAYER_SHORT_NAME,
		name: "Young Player of the Season",
		group: "div",
		maxAge: YOUNG_PLAYER_MAX_AGE,
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
 * Decided: a World's awards are soccer-style, only each Division's own (see
 * getDivisionAwards). ZenGM's other awards are American ones (Defensive Player
 * of the Year, Sixth Man of the Year, Most Improved Player, Rookie of the Year,
 * and All-Defensive and All-Rookie teams), and a World has no playoffs, so no
 * playoff awards.
 */
export const getWorldAwards = (): AwardSetting[] => getDivisionAwards();

/**
 * A World's awards before they were soccer-style: each Division's own without
 * the Young Player of the Season, plus ZenGM's default awards other than the
 * league MVP, All-League teams, and playoff awards. A World with these is
 * switched once when it loads (see ensureCompetitionStructure).
 */
export const getWorldAwardsBeforeSoccerStyle = (): AwardSetting[] => [
	...getDivisionAwards().filter(
		(award) => award.shortName !== YOUNG_PLAYER_SHORT_NAME,
	),
	...defaultGameAttributes.awards.filter(
		(award) =>
			award.shortName !== defaultAwards.mvp.shortName &&
			award.shortName !== defaultAwards.all.shortName &&
			typeof award.statRange !== "number" &&
			award.statRange !== "playoffs",
	),
];
