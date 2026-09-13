import clsx from "clsx";
import { helpers } from "../../util/helpers.ts";
import { ColPtsOrGB, TeamColumn } from "../Standings.tsx";
import type { View } from "../../../common/types.ts";
import { LeagueTableSmall } from "../../components/LeagueTable.tsx";

const width100 = {
	width: "100%",
};

const Standings = ({
	confOrAllTeams,
	maxPlayoffSeed,
	maxPlayoffSeedNoPlayIn,
	playoffsByConf,
	pointsFormula,
	usePts,
	userTid,
	worldTable,
	worldTableSeasonOver,
}: Pick<
	View<"leagueDashboard">,
	| "confOrAllTeams"
	| "maxPlayoffSeed"
	| "maxPlayoffSeedNoPlayIn"
	| "playoffsByConf"
	| "pointsFormula"
	| "usePts"
	| "worldTable"
	| "worldTableSeasonOver"
> & {
	userTid: number;
}) => {
	// International Soccer Zen GM mod (Epic 6): the user's Division's table
	if (worldTable) {
		return (
			<LeagueTableSmall
				division={worldTable}
				seasonOver={worldTableSeasonOver}
				userTid={userTid}
			/>
		);
	}

	const maxRank = Math.max(...confOrAllTeams.map((t) => t.rank));

	return (
		<>
			<table className="table table-striped table-borderless table-sm mb-1">
				<thead>
					<tr>
						<th style={width100}>{playoffsByConf ? "Conference" : "League"}</th>
						<ColPtsOrGB
							alignRight
							pointsFormula={pointsFormula}
							usePts={usePts}
						/>
					</tr>
				</thead>
				<tbody>
					{confOrAllTeams.map((t, i) => {
						return (
							<tr
								key={t.tid}
								className={clsx({
									separator:
										(i === maxPlayoffSeed - 1 ||
											i === maxPlayoffSeedNoPlayIn - 1) &&
										i < confOrAllTeams.length - 1,
									"table-info": t.tid === userTid,
								})}
							>
								<TeamColumn rank={t.rank} maxRank={maxRank} t={t} />
								<td className="text-end">
									{usePts ? Math.round(t.seasonAttrs.pts) : t.gb}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<a href={helpers.leagueUrl(["standings"])}>» League Standings</a>
		</>
	);
};

export default Standings;
