import clsx from "clsx";
import type { View } from "../../common/types.ts";
import { helpers } from "../util/helpers.ts";
import { ResponsiveTableWrapper } from "./ResponsiveTableWrapper.tsx";
import { TeamLogoInline } from "./TeamLogoInline.tsx";

type Tournament = NonNullable<View<"playoffs">["championsLeague"]>;
type Club = Tournament["qualifiers"][number];
type Game = Tournament["knockoutRounds"][number]["games"][number];

const ClubName = ({
	club,
	season,
	strong,
}: {
	club: Club;
	season: number;
	strong?: boolean;
}) => (
	<span
		className={clsx("d-inline-flex align-items-center", { "fw-bold": strong })}
	>
		<TeamLogoInline
			imgURL={club.imgURL}
			imgURLSmall={club.imgURLSmall}
			className="me-1"
		/>
		<a
			href={helpers.leagueUrl(["roster", `${club.abbrev}_${club.tid}`, season])}
		>
			{club.region} {club.name}
		</a>
	</span>
);

const formatPrize = (amount: number) =>
	helpers.formatCurrency(amount / 1000, "M", 1);

const score = (game: { homePts?: number; awayPts?: number }) =>
	game.homePts === undefined || game.awayPts === undefined
		? "–"
		: `${game.homePts}–${game.awayPts}`;

const GameCard = ({
	game,
	season,
	userTid,
}: {
	game: Game;
	season: number;
	userTid: number;
}) => (
	<table
		className="table table-sm table-borderless border mb-2"
		style={{ width: 320 }}
	>
		<tbody>
			{[game.home, game.away].map((club, index) => (
				<tr
					key={club.tid}
					className={clsx({ "table-info": club.tid === userTid })}
				>
					<td>
						<ClubName
							club={club}
							season={season}
							strong={club.tid === game.winnerTid}
						/>
					</td>
					<td
						className={clsx("text-end", {
							"fw-bold": club.tid === game.winnerTid,
						})}
					>
						{index === 0 ? game.homePts : game.awayPts}
					</td>
				</tr>
			))}
			{game.gid !== undefined ? (
				<tr>
					<td colSpan={2}>
						<a
							href={helpers.leagueUrl([
								"game_log",
								`${game.home.abbrev}_${game.home.tid}`,
								season,
								game.gid,
							])}
						>
							Box score
						</a>
					</td>
				</tr>
			) : null}
		</tbody>
	</table>
);

export const ChampionsLeague = ({
	season,
	tournament,
	userTid,
}: {
	season: number;
	tournament: Tournament;
	userTid: number;
}) => {
	if (!tournament.available) {
		return (
			<>
				<p>There was no Champions League in {season}.</p>
				{tournament.pastWinners.length > 0 ? (
					<PastWinners season={season} tournament={tournament} />
				) : null}
			</>
		);
	}

	return (
		<>
			{tournament.champion ? (
				<div className="alert alert-success">
					<strong>Champions League winner:</strong>{" "}
					<ClubName club={tournament.champion} season={season} strong />
				</div>
			) : (
				<p className="text-body-secondary">
					The top clubs from every Country play six group matches before a
					single-game knockout bracket. Group winners are seeded, and the final
					is at a neutral site.
				</p>
			)}

			<h2>Qualification</h2>
			<ResponsiveTableWrapper>
				<table className="table table-striped table-sm table-hover">
					<thead>
						<tr>
							<th className="text-end">Seed</th>
							<th>Club</th>
							<th>Country</th>
							<th className="text-end">Domestic finish</th>
							<th className="text-end">Prize money</th>
						</tr>
					</thead>
					<tbody>
						{tournament.qualifiers.map((club) => (
							<tr
								key={club.tid}
								className={clsx({ "table-info": club.tid === userTid })}
							>
								<td className="text-end">{club.seed}</td>
								<td>
									<ClubName club={club} season={season} />
								</td>
								<td>{club.countryName}</td>
								<td className="text-end">{club.domesticPosition}</td>
								<td className="text-end">{formatPrize(club.prizeMoney)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</ResponsiveTableWrapper>

			<h2>Group stage</h2>
			<div className="row">
				{tournament.groups.map((group) => (
					<div className="col-12 col-xl-6 mb-4" key={group.groupId}>
						<h3>Group {String.fromCharCode(65 + group.groupId)}</h3>
						<ResponsiveTableWrapper>
							<table className="table table-striped table-sm table-hover mb-2">
								<thead>
									<tr>
										<th className="text-end">#</th>
										<th>Club</th>
										<th>P</th>
										<th>W</th>
										<th>D</th>
										<th>L</th>
										<th>Diff</th>
										<th>Pts</th>
									</tr>
								</thead>
								<tbody>
									{group.rows.map((row, index) => (
										<tr
											key={row.tid}
											className={clsx({
												"table-info": row.tid === userTid,
											})}
										>
											<td
												className={clsx("text-end", {
													"border-start border-4 border-success": index < 2,
												})}
											>
												{index + 1}
											</td>
											<td>
												<ClubName club={row.club} season={season} />
											</td>
											<td>{row.played}</td>
											<td>{row.won}</td>
											<td>{row.drawn}</td>
											<td>{row.lost}</td>
											<td>
												{row.pointDifferential > 0 ? "+" : ""}
												{row.pointDifferential}
											</td>
											<td className="fw-bold">{row.points}</td>
										</tr>
									))}
								</tbody>
							</table>
						</ResponsiveTableWrapper>
						<details>
							<summary>Group results</summary>
							{group.matchdays.map((matchday) => (
								<div key={matchday.matchday} className="mt-2">
									<strong>Matchday {matchday.matchday + 1}</strong>
									{matchday.games.map((game) => (
										<div
											key={`${game.homeTid}-${game.awayTid}`}
											className="d-flex justify-content-between gap-2"
										>
											<span>
												<ClubName club={game.home} season={season} /> vs{" "}
												<ClubName club={game.away} season={season} />
											</span>
											{game.gid !== undefined ? (
												<a
													href={helpers.leagueUrl([
														"game_log",
														`${game.home.abbrev}_${game.home.tid}`,
														season,
														game.gid,
													])}
												>
													{score(game)}
												</a>
											) : (
												<span>{score(game)}</span>
											)}
										</div>
									))}
								</div>
							))}
						</details>
					</div>
				))}
			</div>

			<h2>Knockout rounds</h2>
			{tournament.knockoutRounds.length === 0 ? (
				<p>The knockout bracket has not started.</p>
			) : (
				<div className="d-flex flex-wrap gap-4 mb-4">
					{tournament.knockoutRounds.map((round) => (
						<div key={round.round}>
							<h3>
								{round.games.length === 1
									? "Final"
									: round.games.length === 2
										? "Semifinals"
										: "Quarterfinals"}
							</h3>
							{round.games.map((game) => (
								<GameCard
									key={`${game.homeTid}-${game.awayTid}`}
									game={game}
									season={season}
									userTid={userTid}
								/>
							))}
						</div>
					))}
				</div>
			)}

			<div className="row">
				<div className="col-12 col-lg-6">
					<h2>Five-year Country coefficients</h2>
					<table className="table table-striped table-sm">
						<thead>
							<tr>
								<th className="text-end">#</th>
								<th>Country</th>
								<th className="text-end">Points</th>
							</tr>
						</thead>
						<tbody>
							{tournament.coefficients.map((row, index) => (
								<tr key={row.countryId}>
									<td className="text-end">{index + 1}</td>
									<td>{row.countryName}</td>
									<td className="text-end">{row.points}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="col-12 col-lg-6">
					<PastWinners season={season} tournament={tournament} />
				</div>
			</div>
		</>
	);
};

const PastWinners = ({
	season,
	tournament,
}: {
	season: number;
	tournament: Tournament;
}) => (
	<>
		<h2>Past winners</h2>
		{tournament.pastWinners.length === 0 ? (
			<p>No champion has been crowned yet.</p>
		) : (
			<table className="table table-striped table-sm">
				<thead>
					<tr>
						<th>Season</th>
						<th>Champion</th>
					</tr>
				</thead>
				<tbody>
					{tournament.pastWinners.map((winner) => (
						<tr key={winner.season}>
							<td>
								<a href={helpers.leagueUrl(["playoffs", winner.season])}>
									{winner.season}
								</a>
							</td>
							<td>
								<ClubName club={winner.club} season={season} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		)}
	</>
);
