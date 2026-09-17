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
import { WorldHonours } from "./WorldHonours.tsx";
import { WorldRivals } from "./WorldRivals.tsx";
import { WorldLegends } from "./WorldLegends.tsx";

const TeamHistory = ({
	abbrev,
	bestRecord,
	championships,
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
	worldHonours,
	worldLegends,
	worldRivals,
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
					{/* International Soccer Zen GM mod (storytelling): a World club's
					honours in place of playoff appearances and championships */}
					{worldHonours ? (
						<HideableSection pageName="TeamHistory" title="Honours">
							<WorldHonours
								honours={worldHonours}
								totalLost={totalLost}
								totalOtl={totalOtl}
								totalTied={totalTied}
								totalWinp={totalWinp}
								totalWon={totalWon}
							/>
						</HideableSection>
					) : (
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
					)}

					<HideableSection title="Seasons" className="mt-3">
						<Seasons history={history} worldSeasons={worldHonours?.seasons} />
					</HideableSection>
				</div>
				<div className="col-sm-7 col-md-9 mt-3 mt-sm-0">
					{/* International Soccer Zen GM mod (Epic 6) */}
					{leagueHistory && leagueHistory.seasons.length > 0 ? (
						<HideableSection title="League history" className="mb-3">
							<LeagueHistoryChart leagueHistory={leagueHistory} />
						</HideableSection>
					) : null}
					{/* International Soccer Zen GM mod (storytelling) */}
					{worldRivals ? (
						<HideableSection title="Rivals" className="mb-3">
							<WorldRivals abbrev={abbrev} rivals={worldRivals} tid={tid} />
						</HideableSection>
					) : null}
					{worldLegends ? (
						<HideableSection title="Club legends" className="mb-3">
							<WorldLegends legends={worldLegends} />
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
