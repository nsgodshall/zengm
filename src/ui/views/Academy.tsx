import { PHASE } from "../../common/constants.ts";
import { TeamAbbrevLink } from "../components/TeamAbbrevLink.tsx";
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
import {
	makeTransferOffer,
	requestLoan,
	showTransferError,
} from "../util/transferActions.ts";

// International Soccer Zen GM mod (Epic 6): one club's youth academy, from
// worker/views/academy.ts

type AcademyPlayer = View<"academy">["players"][number];

const Academy = ({
	abbrev,
	academyRank,
	canManage,
	contract,
	graduationAge,
	isUserClub,
	loanMinAge,
	maxRosterSize,
	numClubs,
	numPlayersOnRoster,
	onLoan,
	phase,
	players,
	season,
	tid,
	transferWindow,
}: View<"academy">) => {
	useTitleBar({
		title: "Academy",
		dropdownView: "academy",
		dropdownFields: { teams: abbrev },
	});

	const { challengeNoRatings, gender, spectator, teamInfoCache } = useLocal([
		"challengeNoRatings",
		"gender",
		"spectator",
		"teamInfoCache",
	]);

	// International Soccer Zen GM mod (Epic 6): the user can make offers for
	// another club's academy players while a transfer window is open
	const canBuy = !isUserClub && !spectator;
	const clubAbbrev = teamInfoCache[tid]?.abbrev ?? abbrev;

	const name = (p: AcademyPlayer) => `${p.firstName} ${p.lastName}`;

	// International Soccer Zen GM mod (Epic 5)
	const cantLoanTitle = `Academy players can go on loan once they're ${loanMinAge}, until the summer they have to leave`;

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
	if (canManage || canBuy) {
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
							<button
								className={
									p.transferListed
										? "btn btn-xs btn-secondary"
										: "btn btn-xs btn-light-bordered"
								}
								onClick={async () => {
									showTransferError(
										await toWorker("main", "setTransferListed", {
											pid: p.pid,
											listed: !p.transferListed,
										}),
									);
								}}
								title="Clubs make more offers for players on your transfer list, though for less"
							>
								{p.transferListed ? "Listed" : "List"}
							</button>
							<button
								className={
									p.loanListed
										? "btn btn-xs btn-secondary"
										: "btn btn-xs btn-light-bordered"
								}
								disabled={!p.canLoan && !p.loanListed}
								onClick={async () => {
									showTransferError(
										await toWorker("main", "setLoanListed", {
											pid: p.pid,
											listed: !p.loanListed,
										}),
									);
								}}
								title={
									p.canLoan
										? "Clubs ask to borrow players on your loan list until the summer"
										: cantLoanTitle
								}
							>
								{p.loanListed ? "Loan listed" : "Loan list"}
							</button>
						</div>,
					]
				: canBuy
					? [
							<div className="d-flex gap-1" key="buttons">
								<button
									className="btn btn-xs btn-primary"
									disabled={!transferWindow || !p.forSale}
									onClick={() =>
										makeTransferOffer({
											pid: p.pid,
											abbrev: clubAbbrev,
											name: name(p),
											fee: p.fee,
											academy: true,
										})
									}
									title={
										!transferWindow
											? "The transfer window is closed"
											: !p.forSale
												? "He's leaving the academy this summer"
												: `Transfer fee at market value: ${helpers.formatCurrency(p.fee, "M")}`
									}
								>
									Make offer
								</button>
								<button
									className="btn btn-xs btn-light-bordered"
									disabled={!transferWindow || !p.canLoan}
									onClick={() => requestLoan({ pid: p.pid })}
									title={
										!transferWindow
											? "The transfer window is closed"
											: !p.canLoan
												? cantLoanTitle
												: "Ask to borrow him until the summer, if his club doesn't think he's ready for its first team. You'd pay him the minimum wage."
									}
								>
									Borrow
								</button>
							</div>,
						]
					: []),
		],
	}));

	// International Soccer Zen GM mod (Epic 5): academy players out on loan
	const onLoanCols = getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]);
	onLoanCols.push({
		title: "Until",
		desc: "He comes back to the academy in the summer of this season",
		sortSequence: ["asc", "desc"],
		sortType: "number",
	});

	const onLoanRows: DataTableRow[] = onLoan.map((p) => ({
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
				value: <TeamAbbrevLink abbrev={p.abbrev} tid={p.tid} />,
				sortValue: p.abbrev,
				searchValue: p.abbrev,
			},
			p.loanEndSeason,
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
				) : null}{" "}
				Players {loanMinAge} or older can go on loan to another club's first
				team until the summer, on the minimum wage, and then come back.
			</p>

			{canManage ? (
				<p>
					Promoted players sign for the minimum wage for 3 seasons, and can be
					released for free until the regular season starts. Your first team has{" "}
					{numPlayersOnRoster} of {maxRosterSize} players. Put players on your
					loan list for clubs to ask to borrow them.
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

			{onLoanRows.length > 0 ? (
				<>
					<h2>Out on loan</h2>
					<DataTable
						cols={onLoanCols}
						defaultSort={[0, "asc"]}
						name="AcademyOnLoan"
						rows={onLoanRows}
					/>
				</>
			) : null}
		</>
	);
};

export default Academy;
