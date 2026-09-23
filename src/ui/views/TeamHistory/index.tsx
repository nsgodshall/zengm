import useTitleBar from "../../hooks/useTitleBar.tsx";
import type { View } from "../../../common/types.ts";
import Overall from "./Overall.tsx";
import Players from "./Players.tsx";
import RetiredJerseyNumbers from "./RetiredJerseyNumbers.tsx";
import Seasons from "./Seasons.tsx";
import { MoreLinks } from "../../components/MoreLinks.tsx";
import HideableSection from "../../components/HideableSection.tsx";
import { useLocal } from "../../util/local.ts";
import { Championships } from "./Championships.tsx";
import { LeagueHistoryChart } from "./LeagueHistoryChart.tsx";
import { helpers } from "../../util/helpers.ts";

const TeamHistory = ({
	abbrev,
	bestRecord,
	championships,
	championsLeague,
	finalsAppearances,
	history,
	leagueHistory,
	players,
	playoffAppearances,
	retiredJerseyNumbers,
	stats,
	tid,
	totalLost,
	totalOtl,
	totalTied,
	totalWinp,
	totalWon,
	worstRecord,
}: View<"teamHistory">) => {
	useTitleBar({
		title: "Team History",
		dropdownView: "team_history",
		dropdownFields: { teams: abbrev },
	});
	const { godMode, season, userTid } = useLocal([
		"godMode",
		"season",
		"userTid",
	]);

	return (
		<>
			<MoreLinks type="team" page="team_history" abbrev={abbrev} tid={tid} />

			<div className="row">
				<div className="col-sm-5 col-md-3">
					<HideableSection pageName="TeamHistory" title="Overall">
						<Overall
							bestRecord={bestRecord}
							championships={championships}
							finalsAppearances={finalsAppearances}
							playoffAppearances={playoffAppearances}
							totalLost={totalLost}
							totalOtl={totalOtl}
							totalTied={totalTied}
							totalWinp={totalWinp}
							totalWon={totalWon}
							worstRecord={worstRecord}
						/>
					</HideableSection>

					<HideableSection title="Seasons" className="mt-3">
						<Seasons history={history} />
					</HideableSection>
				</div>
				<div className="col-sm-7 col-md-9 mt-3 mt-sm-0">
					{championsLeague.finals.length > 0 ||
					championsLeague.titles.length > 0 ? (
						<HideableSection title="Champions League" className="mb-3">
							<div className="d-flex flex-wrap align-items-center gap-3 mb-2">
								<div
									className="d-flex align-items-center justify-content-center rounded-circle bg-warning text-dark fw-bold"
									style={{ width: 64, height: 64, fontSize: 20 }}
									title="Champions League trophy"
								>
									CL
								</div>
								<div>
									<div>
										Titles: <strong>{championsLeague.titles.length}</strong>
									</div>
									<div>Final appearances: {championsLeague.finals.length}</div>
								</div>
							</div>
							{championsLeague.titles.length > 0 ? (
								<div>
									Won in{" "}
									{championsLeague.titles.map((titleSeason, index) => (
										<span key={titleSeason}>
											{index > 0 ? ", " : null}
											<a href={helpers.leagueUrl(["playoffs", titleSeason])}>
												{titleSeason}
											</a>
										</span>
									))}
								</div>
							) : null}
						</HideableSection>
					) : null}
					{/* International Soccer Zen GM mod (Epic 6) */}
					{leagueHistory && leagueHistory.seasons.length > 0 ? (
						<HideableSection title="League history" className="mb-3">
							<LeagueHistoryChart leagueHistory={leagueHistory} />
						</HideableSection>
					) : null}
					<RetiredJerseyNumbers
						godMode={godMode}
						players={players}
						retiredJerseyNumbers={retiredJerseyNumbers}
						season={season}
						tid={tid}
						userTid={userTid}
					/>
					<Championships history={history} />
					<HideableSection title="Players">
						<Players
							godMode={godMode}
							season={season}
							players={players}
							stats={stats}
							tid={tid}
							userTid={userTid}
						/>
					</HideableSection>
				</div>
			</div>
		</>
	);
};

export default TeamHistory;
