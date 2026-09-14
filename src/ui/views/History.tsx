import { MoreLinks } from "../components/MoreLinks.tsx";
import { RetiredPlayers } from "../components/RetiredPlayers.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import type { View } from "../../common/types.ts";
import { useLocal } from "../util/local.ts";
import { helpers } from "../util/helpers.ts";
import React from "react";
import { showStatsByType } from "../../common/awards.ts";
import { getCol } from "../../common/getCol.ts";

type ActualProps = Exclude<
	View<"history">,
	{ invalidSeason: true; season: number }
>;

const NO_WINNER = "No winner";

const Winner = ({
	award,
	indentStats,
	p,
	season,
	userTid,
}: {
	award:
		| ActualProps["awards"]["individualAwards"][number]
		| ActualProps["awards"]["teamAwards"][number];
	indentStats?: boolean;
	p:
		| ActualProps["awards"]["individualAwards"][number]["winner"]
		| { pid?: undefined; pos?: string };
	season: number;
	userTid: number;
}) => {
	const stats = showStatsByType[award.showStats];
	if (!stats) {
		throw new Error("Invalid showStats");
	}

	if (!p) {
		return null;
	}

	if (p.pid === undefined) {
		return (
			<div>
				{p.pos} {NO_WINNER}
				<br />
				<br />
			</div>
		);
	}

	return (
		<>
			<div>
				<span className={p.stats.tid === userTid ? "table-info" : undefined}>
					{p.pos}{" "}
					<b>
						<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a>
					</b>{" "}
					(
					<a
						href={helpers.leagueUrl([
							"roster",
							`${p.stats.abbrev}_${p.stats.tid}`,
							season,
						])}
					>
						{p.stats.abbrev}
					</a>
					)
				</span>
			</div>
			<div className={indentStats ? "ms-3" : undefined}>
				{stats
					.map(
						(stat) =>
							`${helpers.roundStat(p.statOverrides?.[stat] ?? p.stats[stat], stat)}${stat === "keyStats" ? "" : ` ${getCol(`stat:${stat}`).title}`}`,
					)
					.join(", ")}
			</div>
		</>
	);
};

const Teams = ({
	award,
	season,
	userTid,
}: {
	award: ActualProps["awards"]["teamAwards"][number];
	season: number;
	userTid: number;
}) => {
	const multipleTeams = award.winner.length > 1;

	return (
		<>
			{multipleTeams ? <h2>{award.name}</h2> : null}
			{award.winner.map((t, i) => {
				if (t.length === 0) {
					return null;
				}

				return (
					<div key={i} className="mb-3">
						{multipleTeams ? (
							<h3>{helpers.ordinal(i + 1)} team</h3>
						) : (
							<h2>{award.name} team</h2>
						)}
						{t.map((p, i) => {
							return (
								<div key={i}>
									{p ? (
										<Winner
											award={award}
											indentStats
											p={p}
											season={season}
											userTid={userTid}
										/>
									) : null}
								</div>
							);
						})}
					</div>
				);
			})}
		</>
	);
};

const splitTeamAwards = <T extends { numTeams: number }>(teamAwards: T[]) => {
	let sum = 0;
	for (const row of teamAwards) {
		sum += row.numTeams;
	}
	const target = Math.ceil(sum);
	const teamAwards1: T[] = [];
	const teamAwards2: T[] = [];

	let sum2 = 0;
	for (const row of teamAwards) {
		sum2 += row.numTeams;
		if (teamAwards1.length === 0 || sum2 <= target / 2) {
			teamAwards1.push(row);
		} else {
			teamAwards2.push(row);
		}
	}

	return { teamAwards1, teamAwards2 };
};

// International Soccer Zen GM mod (Epic 6): what happened in each of a World's
// Divisions, like the season summary on a soccer league's Wikipedia page
const WorldSeason = ({
	season,
	userTid,
	worldSummary,
}: {
	season: number;
	userTid: number;
	worldSummary: NonNullable<ActualProps["worldSummary"]>;
}) => {
	const clubLink = (t: {
		tid: number;
		abbrev: string;
		region: string;
		name: string;
	}) => (
		<span className={t.tid === userTid ? "table-info" : undefined}>
			<a href={helpers.leagueUrl(["roster", `${t.abbrev}_${t.tid}`, season])}>
				{t.region} {t.name}
			</a>
		</span>
	);

	return (
		<div className="row">
			{worldSummary.map((country) => (
				<div
					key={country.countryId}
					className="col-xl-3 col-lg-4 col-sm-6 col-12 mb-3"
				>
					<h2>{country.name}</h2>
					{country.divisions.map((division) => (
						<div key={division.divisionId} className="mb-3">
							<a
								className="fw-bold"
								href={helpers.leagueUrl(["standings", season])}
							>
								{division.name}
							</a>
							<div>
								Champions:{" "}
								{division.champion ? (
									<>
										{clubLink(division.champion)} ({division.champion.points}{" "}
										pts)
									</>
								) : (
									NO_WINNER
								)}
							</div>
							{division.promoted.length > 0 ? (
								<div>
									<span className="text-success">▲</span> Promoted:{" "}
									{division.promoted.map((t, i) => (
										<React.Fragment key={t.tid}>
											{i > 0 ? ", " : null}
											{clubLink(t)}
											{t.viaPlayoff ? (
												<>
													{" "}
													(
													<a href={helpers.leagueUrl(["playoffs", season])}>
														playoff
													</a>
													)
												</>
											) : null}
										</React.Fragment>
									))}
								</div>
							) : null}
							{division.relegated.length > 0 ? (
								<div>
									<span className="text-danger">▼</span> Relegated:{" "}
									{division.relegated.map((t, i) => (
										<React.Fragment key={t.tid}>
											{i > 0 ? ", " : null}
											{clubLink(t)}
										</React.Fragment>
									))}
								</div>
							) : null}
							{division.awards.map((award) => (
								<div key={award.name}>
									{award.name}:{" "}
									{award.winners.length > 0
										? award.winners.map((p, i) => (
												<React.Fragment key={p.pid}>
													{i > 0 ? ", " : null}
													<span
														className={
															p.tid === userTid ? "table-info" : undefined
														}
													>
														<a href={helpers.leagueUrl(["player", p.pid])}>
															{p.name}
														</a>{" "}
														(
														<a
															href={helpers.leagueUrl([
																"roster",
																`${p.abbrev}_${p.tid}`,
																season,
															])}
														>
															{p.abbrev}
														</a>
														)
													</span>
												</React.Fragment>
											))
										: NO_WINNER}
								</div>
							))}
						</div>
					))}
				</div>
			))}
		</div>
	);
};

const History = (props: View<"history">) => {
	const { invalidSeason, season } = props;

	useTitleBar({
		title: "Season Summary",
		jumpTo: true,
		jumpToSeason: season,
		dropdownView: "history",
		dropdownFields: {
			seasonsHistory: season,
		},
	});
	const { userTid } = useLocal(["userTid"]);

	if (invalidSeason) {
		return (
			<>
				<h2>Error</h2>
				<p>Invalid season.</p>
			</>
		);
	}

	const { awards, champ, confs, retiredPlayers, retiredStat, worldSummary } =
		props;

	// International Soccer Zen GM mod (Epic 6): a World's Division awards are
	// with their Divisions above
	const notDivisionAward = (award: { group?: { type: string } }) =>
		!worldSummary || award.group?.type !== "div";
	const individualAwards = awards.individualAwards.filter(notDivisionAward);

	const { teamAwards1, teamAwards2 } = splitTeamAwards(
		awards.teamAwards.filter(notDivisionAward),
	);

	const groupedIndividualAwardsPlayoffs = Object.values(
		Object.groupBy(awards.individualAwardsPlayoffs, (award) => award.shortName),
	);

	const bestRecordConfs = Array.from(awards.bestRecordConfs.entries());

	return (
		<>
			<MoreLinks type="awards" page="history" season={season} />

			{worldSummary ? (
				<WorldSeason
					season={season}
					userTid={userTid}
					worldSummary={worldSummary}
				/>
			) : null}

			<div className="row">
				<div className="col-md-3 col-sm-4 col-12">
					<div className="row">
						{/* International Soccer Zen GM mod (Epic 6): a World's champions are above */}
						<div className="col-sm-12 col-6" hidden={!!worldSummary}>
							<h2>League Champs</h2>
							{champ ? (
								<div>
									<div className="mb-3">
										<span
											className={
												champ.tid === userTid ? "table-info" : undefined
											}
										>
											<b>
												<a
													href={helpers.leagueUrl([
														"roster",
														`${champ.seasonAttrs.abbrev}_${champ.tid}`,
														season,
													])}
												>
													{champ.seasonAttrs.region} {champ.seasonAttrs.name}
												</a>
											</b>
										</span>
										<br />
										<a href={helpers.leagueUrl(["playoffs", season])}>
											Playoff bracket
										</a>
									</div>
									{groupedIndividualAwardsPlayoffs.map((groupedAwards, i) => {
										const firstAward = groupedAwards?.[0];
										if (!firstAward) {
											return;
										}
										return (
											<React.Fragment key={i}>
												<div className="mb-3">
													{helpers.plural(
														firstAward.name,
														groupedAwards.length,
													)}
													:{" "}
													{groupedAwards.map((award, i) => {
														return award.winner ? (
															<Winner
																key={i}
																award={award}
																p={award.winner}
																season={awards.season}
																userTid={userTid}
															/>
														) : (
															NO_WINNER
														);
													})}
												</div>
											</React.Fragment>
										);
									})}
								</div>
							) : (
								<div className="mb-3">{NO_WINNER}</div>
							)}
							<h2>Best Record</h2>
							{bestRecordConfs.map(([cid, t]) =>
								t ? (
									<div key={cid} className="mb-3">
										{bestRecordConfs.length === 1 ? null : (
											<div>{confs[cid]?.name}:</div>
										)}
										<span
											className={t.tid === userTid ? "table-info" : undefined}
										>
											<a
												href={helpers.leagueUrl([
													"roster",
													`${t.seasonAttrs.abbrev}_${t.tid}`,
													season,
												])}
											>
												{t.seasonAttrs.region} {t.seasonAttrs.name}
											</a>{" "}
											({helpers.formatRecord(t.seasonAttrs)})
										</span>
										<br />
									</div>
								) : null,
							)}
						</div>
						<div className="col-sm-12 col-6">
							{individualAwards.map((award, i) => {
								return (
									<React.Fragment key={i}>
										<h2>{award.name}</h2>
										<div className="mb-3">
											{award.winner ? (
												<Winner
													award={award}
													p={award.winner}
													season={awards.season}
													userTid={userTid}
												/>
											) : (
												NO_WINNER
											)}
										</div>
									</React.Fragment>
								);
							})}
						</div>
					</div>
				</div>
				<div className="col-xl-2 col-md-3 col-sm-4 col-6">
					{teamAwards1.map((award, i) => {
						return (
							<Teams
								key={i}
								award={award}
								season={awards.season}
								userTid={userTid}
							/>
						);
					})}
				</div>
				<div className="col-xl-2 col-md-3 col-sm-4 col-6">
					{teamAwards2.map((award, i) => {
						return (
							<Teams
								key={i}
								award={award}
								season={awards.season}
								userTid={userTid}
							/>
						);
					})}
				</div>
				<div className="col-xl-5 col-md-3 col-sm-12">
					<RetiredPlayers
						retiredPlayers={retiredPlayers}
						retiredStat={retiredStat}
						season={season}
						userTid={userTid}
					/>
				</div>
			</div>
		</>
	);
};

export default History;
