import { Fragment } from "react";
import { MoreLinks } from "../components/MoreLinks.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import type { View } from "../../common/types.ts";
import { toWorker } from "../util/toWorker.ts";
import { useLocal } from "../util/local.ts";
import { DAILY_SCHEDULE } from "../../common/constants.ts";
import { NoGamesMessage } from "./GameLog.tsx";
import allowForceTie from "../../common/allowForceTie.ts";
import { ForceWin } from "../components/ForceWin.tsx";
import { ScoreBox } from "../components/ScoreBox/index.tsx";

const DailySchedule = ({
	cid,
	cids,
	completed,
	day,
	days,
	elam,
	elamASG,
	isToday,
	season,
	ties,
	topPlayers,
	upcoming,
	worldDivisions,
	worldRivalPairs,
}: View<"dailySchedule">) => {
	useTitleBar({
		title: DAILY_SCHEDULE,
		dropdownView: "daily_schedule",
		dropdownFields: { seasons: season, days: day, cids: cid ?? "all" },
		dropdownCustomOptions: {
			cids,
			days,
		},
	});

	const {
		gameSimInProgress,
		phase,
		season: currentSeason,
		userTid,
	} = useLocal(["gameSimInProgress", "phase", "season", "userTid"]);

	let simToDay = null;
	if (upcoming.length > 0 && !isToday) {
		const minGid = Math.min(...upcoming.map((game) => game.gid));
		simToDay = (
			<div className="mb-3">
				<button
					className="btn btn-secondary"
					disabled={gameSimInProgress}
					onClick={() => {
						toWorker("actions", "simToGame", minGid);
					}}
				>
					Sim to day
				</button>
			</div>
		);
	}

	const upcomingAndCompleted = upcoming.length > 0 && completed.length > 0;

	// International Soccer Zen GM mod (storytelling, Phase 5): a World says when
	// a fixture is a derby or another rivalry
	const rivalry = (game: { teams: [{ tid: number }, { tid: number }] }) => {
		const [a, b] = [game.teams[0].tid, game.teams[1].tid];
		const pair =
			worldRivalPairs?.[`${Math.min(a, b)}-${Math.max(a, b)}`] ?? undefined;
		if (!pair) {
			return null;
		}
		return (
			<div className="text-body-secondary small">
				{pair.derbyTown ? `${pair.derbyTown} derby` : "Rivalry"}
			</div>
		);
	};

	const tradeDeadline =
		upcoming.length === 1 &&
		upcoming[0]!.teams[0].tid === -3 &&
		upcoming[0]!.teams[1].tid === -3;

	let noGamesMessage;
	if (days.length === 0) {
		noGamesMessage = (
			<NoGamesMessage warnAboutDelete={season < currentSeason} />
		);
	}

	// International Soccer Zen GM mod (Epic 6): in a World, games are grouped by
	// Division, the user's first, each with a heading before its first game
	const getDivisionId = (game: { teams: { tid: number }[] }) =>
		worldDivisions?.divisionIdByTid[game.teams[0]!.tid];
	const sortByDivision = <T extends { teams: { tid: number }[] }>(
		games: T[],
	) => {
		if (!worldDivisions) {
			return games;
		}
		const order = new Map(
			worldDivisions.divisions.map((division, i) => [division.divisionId, i]),
		);
		const index = (game: T) => {
			const divisionId = getDivisionId(game);
			return (
				(divisionId === undefined ? undefined : order.get(divisionId)) ??
				Infinity
			);
		};
		return [...games].sort((a, b) => index(a) - index(b));
	};
	const divisionHeading = <T extends { teams: { tid: number }[] }>(
		game: T,
		i: number,
		games: T[],
	) => {
		const divisionId = getDivisionId(game);
		if (
			!worldDivisions ||
			divisionId === undefined ||
			(i > 0 && getDivisionId(games[i - 1]!) === divisionId)
		) {
			return null;
		}
		const division = worldDivisions.divisions.find(
			(division) => division.divisionId === divisionId,
		);
		return <h3 className="w-100 mb-0">{division?.name}</h3>;
	};

	return (
		<>
			<MoreLinks type="schedule" page="daily_schedule" />

			{noGamesMessage ? (
				noGamesMessage
			) : (
				<>
					{simToDay}

					{tradeDeadline ? (
						<p>
							Sim one day to move past the trade deadline, and then the next
							day's games will be available here.
						</p>
					) : null}

					{upcoming.length > 0 ? (
						<>
							{upcomingAndCompleted ? <h2>Upcoming Games</h2> : null}
							<div className="d-flex flex-wrap" style={{ gap: "1rem 2rem" }}>
								{sortByDivision(upcoming).map((game, i, games) => {
									const actions =
										isToday && !tradeDeadline
											? [
													{
														disabled: gameSimInProgress,
														highlight:
															game.teams[0].tid === userTid ||
															game.teams[1].tid === userTid,
														text: (
															<>
																Watch
																<br />
																game
															</>
														),
														onClick: () =>
															toWorker("actions", "liveGame", game.gid),
													},
													{
														disabled: gameSimInProgress,
														highlight:
															game.teams[0].tid === userTid ||
															game.teams[1].tid === userTid,
														text: (
															<>
																Sim
																<br />
																game
															</>
														),
														onClick: () =>
															toWorker("actions", "simGame", game.gid),
													},
												]
											: undefined;

									const allowTie = allowForceTie({
										homeTid: game.teams[0].tid,
										awayTid: game.teams[1].tid,
										elam,
										elamASG,
										phase,
										ties,
									});

									let playersUpcoming: [any, any] | undefined;
									if (topPlayers.type === "byGid") {
										playersUpcoming = topPlayers.playersByGid[game.gid];
									} else {
										const x0 = topPlayers.playersByTid[game.teams[0].tid];
										const x1 = topPlayers.playersByTid[game.teams[1].tid];

										// Undefined for ASG
										if (x0 && x1) {
											playersUpcoming = [x0[0], x1[0]];
										}
									}

									return (
										<Fragment key={game.gid}>
											{divisionHeading(game, i, games)}
											<div className="flex-grow-1" style={{ maxWidth: 510 }}>
												{rivalry(game)}
												<ScoreBox
													game={{
														// Leave out forceTie, since ScoreBox wants the value for finished games
														finals: game.finals,
														gid: game.gid,
														season: game.season,
														teams: game.teams,
													}}
													playersUpcoming={playersUpcoming}
													actions={actions}
												/>
												<ForceWin allowTie={allowTie} game={game} />
											</div>
										</Fragment>
									);
								})}
							</div>
						</>
					) : null}

					{completed.length > 0 ? (
						<>
							{upcomingAndCompleted ? (
								<h2 className="mt-3">Completed Games</h2>
							) : null}

							<div className="d-flex flex-wrap" style={{ gap: "1rem 2rem" }}>
								{sortByDivision(completed).map((game, i, games) => {
									return (
										<Fragment key={game.gid}>
											{divisionHeading(game, i, games)}
											<div className="flex-grow-1" style={{ maxWidth: 510 }}>
												{rivalry(game)}
												<ScoreBox game={game} />
											</div>
										</Fragment>
									);
								})}
							</div>
						</>
					) : null}
				</>
			)}
		</>
	);
};

export default DailySchedule;
