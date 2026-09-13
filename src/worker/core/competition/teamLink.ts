import { g, helpers } from "../../util/index.ts";

/**
 * A link to a club's roster page for this season, named the way news items name
 * clubs.
 */
const teamLink = (tid: number) => {
	const teamInfo = g.get("teamInfoCache")[tid];
	return `<a href="${helpers.leagueUrl([
		"roster",
		`${teamInfo?.abbrev}_${tid}`,
		g.get("season"),
	])}">${teamInfo?.region} ${teamInfo?.name}</a>`;
};

export default teamLink;
