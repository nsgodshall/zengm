import clsx from "clsx";
import { Fragment } from "react";
import type { View } from "../../common/types.ts";
import { helpers } from "../util/helpers.ts";
import { TeamLogoInline } from "./TeamLogoInline.tsx";

// International Soccer Zen GM mod (Epic 6): a World's promotion playoffs, from
// competition/promotionPlayoffBrackets.ts

type Brackets = NonNullable<View<"playoffs">["promotionPlayoffs"]>;
type Bracket = Brackets[number];
type Club = Bracket["participants"][number];
type Game = Bracket["rounds"][number][number];

const ClubName = ({
	bold,
	club,
	season,
}: {
	bold?: boolean;
	club: Club;
	season: number;
}) => (
	<span
		className={clsx("d-inline-flex align-items-center", { "fw-bold": bold })}
	>
		<TeamLogoInline
			imgURL={club.imgURL}
			imgURLSmall={club.imgURLSmall}
			className="me-1"
		/>
		{club.seed !== undefined ? (
			<span className="text-body-secondary me-1">{club.seed}</span>
		) : null}
		<a
			href={helpers.leagueUrl(["roster", `${club.abbrev}_${club.tid}`, season])}
		>
			{club.region} {club.name}
		</a>
	</span>
);

const GameResult = ({
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
			{[game.home, game.away].map((club) => {
				const won = club.tid === game.winnerTid;
				return (
					<tr
						key={club.tid}
						className={clsx({ "table-info": club.tid === userTid })}
					>
						<td>
							<ClubName bold={won} club={club} season={season} />
						</td>
						<td className={clsx("text-end", { "fw-bold": won })}>{club.pts}</td>
					</tr>
				);
			})}
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

/**
 * Each promotion playoff: its clubs by seed before it's played, and its games
 * round by round after
 */
export const PromotionPlayoffs = ({
	brackets,
	season,
	userTid,
}: {
	brackets: Brackets;
	season: number;
	userTid: number;
}) => {
	if (brackets.length === 0) {
		return <p>No Division in this World has a promotion playoff.</p>;
	}

	return (
		<>
			{brackets.map((bracket) => {
				const numRounds = bracket.rounds.length;

				return (
					<Fragment key={bracket.linkId}>
						<h2 className="mb-1">{bracket.divisionName} promotion playoff</h2>
						<p className="text-body-secondary">
							{bracket.countryName}: {bracket.participants.length} clubs play
							for {bracket.numSpots} {helpers.plural("place", bracket.numSpots)}{" "}
							in {bracket.upperDivisionName}. Seeds are table positions. The
							better seed plays at home, and goes through if a game is tied.
						</p>

						{numRounds === 0 ? (
							<>
								<p>No games have been played. The clubs in its places:</p>
								<ul className="list-unstyled">
									{bracket.participants.map((club) => (
										<li key={club.tid} className="mb-1">
											<ClubName
												bold={club.tid === userTid}
												club={club}
												season={season}
											/>
										</li>
									))}
								</ul>
							</>
						) : (
							<div className="d-flex flex-wrap gap-4 mb-3">
								{bracket.rounds.map((games, round) => (
									<div key={round}>
										<h3>
											{round === numRounds - 1 && games.length === 1
												? "Final"
												: `Round ${round + 1}`}
										</h3>
										{games.map((game) => (
											<GameResult
												key={`${game.home.tid}-${game.away.tid}`}
												game={game}
												season={season}
												userTid={userTid}
											/>
										))}
									</div>
								))}
							</div>
						)}
					</Fragment>
				);
			})}
		</>
	);
};
