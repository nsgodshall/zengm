import { useState } from "react";
import { DataTable } from "../components/DataTable/index.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { getCols } from "../../common/getCols.ts";
import type { View } from "../../common/types.ts";
import TeamLogoAndName from "../components/TeamLogoAndName.tsx";
import { useLocal } from "../util/local.ts";

const teamLink = (t: View<"teamRecords">["teams"][number]) => {
	return {
		value: t.root ? (
			<TeamLogoAndName
				t={{ ...t, seasonAttrs: t }}
				url={helpers.leagueUrl(["team_history", `${t.abbrev}_${t.tid}`])}
			/>
		) : (
			<span className="ms-2">
				{t.region} {t.name}
			</span>
		),
		sortValue: t.sortValue,
	};
};

const isHistorical = (t: { root: boolean; disabled?: boolean }) =>
	!t.root || t.disabled;

const blankIfZero = (x: number) => (x === 0 ? undefined : x);

const TeamRecords = ({
	awardTypes,
	byType,
	filter,
	teams,
	ties,
	otl,
	usePts,
	world,
}: View<"teamRecords">) => {
	const [showHistorical, setShowHistorical] = useState(true);

	useTitleBar({
		title: "Team Records",
		dropdownView: "team_records",
		dropdownFields: { teamRecordType: byType, teamRecordsFilter: filter },
	});
	const { userTid } = useLocal(["userTid"]);

	let displayName: string;
	if (byType === "by_conf") {
		displayName = "Conference";
	} else if (byType === "by_div") {
		displayName = "Division";
	} else {
		displayName = "Team";
	}

	const cols = getCols([
		...(displayName === "Division" ? ["Conference"] : []),
		displayName,
		"Start",
		"End",
		"# Seasons",
		"W",
		"L",
		...(otl ? ["OTL"] : []),
		...(ties ? ["T"] : []),
		...(usePts ? ["PTS", "PTS%"] : ["%"]),
		// International Soccer Zen GM mod (storytelling): a World's honours in
		// place of playoff records
		...(world
			? [
					{
						title: "Top",
						desc: "Seasons in the Top Tier",
						sortSequence: ["desc", "asc"] as const,
						sortType: "number" as const,
					},
					"Titles",
					"Last",
					{
						title: "Lower",
						desc: "Lower Tier Titles",
						sortSequence: ["desc", "asc"] as const,
						sortType: "number" as const,
					},
					{
						title: "Up",
						desc: "Promotions",
						sortSequence: ["desc", "asc"] as const,
						sortType: "number" as const,
					},
					{
						title: "Down",
						desc: "Relegations",
						sortSequence: ["desc", "asc"] as const,
						sortType: "number" as const,
					},
					{
						title: "Best",
						desc: "Best Finish",
						sortType: "number" as const,
					},
				]
			: [
					"PlayoffAppearances",
					"Last",
					"Finals",
					"Last",
					"Titles",
					"Last",
					"BR",
					"BRC",
					"BRD",
				]),
		...awardTypes.map((award) => {
			return {
				desc: award.name,
				title: award.shortName,
				sortSequence: ["desc", "asc"] as const,
				sortType: "number" as const,
			};
		}),
		"AS",
		"ASMVP",
	]);

	const lasts = cols.filter((col) => col.title === "Last");
	if (world) {
		lasts[0]!.desc = "Last Top Tier Title";
	} else {
		lasts[0]!.desc = "Last Playoffs Appearance";
		lasts[1]!.desc = "Last Finals Appearance";
		lasts[2]!.desc = "Last Championship";
	}

	const rows = teams
		.filter((t) => showHistorical || !isHistorical(t))
		.map((t, i) => {
			return {
				key: i,
				data: [
					...(displayName === "Division" ? [t.confName] : []),
					byType === "by_team" ? teamLink(t) : t.name,
					t.start,
					t.end,
					t.numSeasons,
					t.won,
					t.lost,
					...(otl ? [t.otl] : []),
					...(ties ? [t.tied] : []),
					...(usePts
						? [t.pts, helpers.roundWinp(t.ptsPct)]
						: [helpers.roundWinp(t.winp)]),
					...(world
						? [
								t.world?.topTierSeasons,
								blankIfZero(t.world?.titles ?? 0),
								t.world?.lastTitle,
								blankIfZero(t.world?.lowerTitles ?? 0),
								blankIfZero(t.world?.promotions ?? 0),
								blankIfZero(t.world?.relegations ?? 0),
								t.world?.bestFinish
									? {
											value:
												t.world.bestFinish.tier === 1
													? helpers.ordinal(t.world.bestFinish.position)
													: `${helpers.ordinal(t.world.bestFinish.position)} (tier ${t.world.bestFinish.tier})`,
											sortValue:
												100 * t.world.bestFinish.tier +
												t.world.bestFinish.position,
										}
									: undefined,
							]
						: [
								blankIfZero(t.playoffs),
								t.lastPlayoffs,
								blankIfZero(t.finals),
								t.lastFinals,
								blankIfZero(t.titles),
								t.lastTitle,
								blankIfZero(t.bestRecord),
								blankIfZero(t.bestRecordConf),
								blankIfZero(t.bestRecordDiv),
							]),
					...awardTypes.map((award) => {
						return t.custom[award.shortName];
					}),
					blankIfZero(t.allStar),
					blankIfZero(t.allStarMVP),
				],
				classNames: {
					"text-body-secondary": !t.root,
					"table-info": byType === "by_team" && t.root && t.tid === userTid,
				},
			};
		});

	const hasHistoricalTeams = byType === "by_team" && teams.some(isHistorical);

	return (
		<>
			<MoreLinks type="league" page="team_records" />

			{hasHistoricalTeams ? (
				<button
					className="btn btn-secondary"
					onClick={() => {
						setShowHistorical((show) => !show);
					}}
				>
					{showHistorical ? "Hide historical teams" : "Show historical teams"}
				</button>
			) : null}

			<DataTable
				className="align-middle"
				cols={cols}
				defaultSort={[0, "asc"]}
				defaultStickyCols={1}
				name="TeamRecords"
				nonfluid
				rows={rows}
			/>
		</>
	);
};

export default TeamRecords;
