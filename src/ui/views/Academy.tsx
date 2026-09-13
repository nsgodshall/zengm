import { PHASE } from "../../common/constants.ts";
import { getCols } from "../../common/getCols.ts";
import type { View } from "../../common/types.ts";
import {
	DataTable,
	type DataTableRow,
} from "../components/DataTable/index.tsx";
import { wrappedPlayerNameLabels } from "../components/PlayerNameLabels.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { confirm } from "../util/confirm.tsx";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";
import { showNotification } from "../util/showNotification.ts";
import { toWorker } from "../util/toWorker.ts";

// International Soccer Zen GM mod (Epic 6): one club's youth academy, from
// worker/views/academy.ts

type AcademyPlayer = View<"academy">["players"][number];

const Academy = ({
	abbrev,
	academyRank,
	canManage,
	contract,
	graduationAge,
	maxRosterSize,
	numClubs,
	numPlayersOnRoster,
	phase,
	players,
	season,
}: View<"academy">) => {
	useTitleBar({
		title: "Academy",
		dropdownView: "academy",
		dropdownFields: { teams: abbrev },
	});

	const { challengeNoRatings, gender } = useLocal([
		"challengeNoRatings",
		"gender",
	]);

	const name = (p: AcademyPlayer) => `${p.firstName} ${p.lastName}`;

	const promote = async (p: AcademyPlayer) => {
		let message = `Promote ${name(p)} to your first team? ${helpers.pronoun(
			gender,
			"He",
		)} will sign for ${helpers.formatCurrency(
			contract.amount / 1000,
			"M",
		)} a season through ${contract.exp}.`;
		if (numPlayersOnRoster >= maxRosterSize) {
			message += ` Your roster is already full, so you'll have to release someone before your next game.`;
		}

		const proceed = await confirm(message, {
			okText: "Promote",
		});
		if (proceed) {
			const errorMsg = await toWorker("main", "promoteAcademyPlayer", {
				pid: p.pid,
			});
			if (errorMsg) {
				showNotification({
					type: "error",
					text: errorMsg,
				});
			}
		}
	};

	const release = async (p: AcademyPlayer) => {
		const proceed = await confirm(
			`Release ${name(p)} from your academy? ${helpers.pronoun(
				gender,
				"He",
			)} will become a free agent, and any club can sign ${helpers.pronoun(
				gender,
				"him",
			)}.`,
			{
				okText: "Release",
			},
		);
		if (proceed) {
			const errorMsg = await toWorker("main", "releaseAcademyPlayer", {
				pid: p.pid,
			});
			if (errorMsg) {
				showNotification({
					type: "error",
					text: errorMsg,
				});
			}
		}
	};

	const cols = getCols(["Name", "Pos", "Age", "Ovr", "Pot"]);
	cols.push({
		title: "Leaves",
		desc: "The summer this player has to leave the academy",
		sortSequence: ["asc", "desc"],
		sortType: "number",
	});
	if (canManage) {
		cols.push({
			title: "",
			sortSequence: [],
		});
	}

	const rows: DataTableRow[] = players.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			wrappedPlayerNameLabels({
				pid: p.pid,
				season,
				skills: p.skills,
				defaultWatch: p.watch,
				firstName: p.firstName,
				firstNameShort: p.firstNameShort,
				lastName: p.lastName,
			}),
			p.pos,
			p.age,
			!challengeNoRatings ? p.ovr : null,
			!challengeNoRatings ? p.pot : null,
			{
				value: p.graduating ? (
					<span className="badge bg-warning text-dark">This summer</span>
				) : (
					p.graduationSeason
				),
				sortValue: p.graduationSeason,
			},
			...(canManage
				? [
						<div className="d-flex gap-1" key="actions">
							<button
								className="btn btn-xs btn-primary"
								onClick={() => promote(p)}
							>
								Promote
							</button>
							<button
								className="btn btn-xs btn-light-bordered"
								onClick={() => release(p)}
							>
								Release
							</button>
						</div>,
					]
				: []),
		],
	}));

	const numGraduating = players.filter((p) => p.graduating).length;

	return (
		<>
			<p>
				Academy players develop every season but don't play for the first team.
				Each summer a new intake of 16-year-olds joins every academy, and a
				player has to leave in the summer he turns {graduationAge}.
				{academyRank !== undefined ? (
					<>
						{" "}
						This academy is the {helpers.ordinal(academyRank)} strongest of{" "}
						{numClubs}, from the club's scouting budget and its tier, so it gets
						that share of the best prospects.
					</>
				) : null}
			</p>

			{canManage ? (
				<p>
					Promoted players sign for the minimum wage for 3 seasons, and can be
					released for free until the regular season starts. Your first team has{" "}
					{numPlayersOnRoster} of {maxRosterSize} players.
				</p>
			) : null}

			{canManage && numGraduating > 0 ? (
				<p className="text-warning">
					{numGraduating} {helpers.plural("player", numGraduating)}{" "}
					{numGraduating === 1 ? "is" : "are"} graduating. Promote or release{" "}
					{numGraduating === 1 ? "that player" : "them"}
					{phase < PHASE.RESIGN_PLAYERS ? " by the end of re-signing" : ""}. Any
					still here when free agency starts become free agents.
				</p>
			) : null}

			{players.length === 0 ? (
				<p>This academy has no players right now.</p>
			) : (
				<DataTable
					cols={cols}
					defaultSort={[4, "desc"]}
					name="Academy"
					rows={rows}
				/>
			)}
		</>
	);
};

export default Academy;
