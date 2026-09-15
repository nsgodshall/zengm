import { getCols } from "../../common/getCols.ts";
import type { View } from "../../common/types.ts";
import {
	wrappedContractAmount,
	wrappedContractExp,
} from "../components/contract.tsx";
import {
	DataTable,
	type DataTableRow,
} from "../components/DataTable/index.tsx";
import { wrappedPlayerNameLabels } from "../components/PlayerNameLabels.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { confirm } from "../util/confirm.tsx";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";
import { toWorker } from "../util/toWorker.ts";
import {
	formatMillions,
	makeTransferOffer as makeOffer,
	requestLoan,
	showTransferError as showError,
} from "../util/transferActions.ts";

// International Soccer Zen GM mod (Epic 6): the user's transfer business, from
// worker/views/transferMarket.ts

type MarketPlayer = View<"transferMarket">["players"][number];
type Offer = View<"transferMarket">["offers"][number];

const TransferMarket = ({
	academyPlayers,
	loanMinAge,
	cash,
	maxRosterSize,
	numPlayersOnRoster,
	offers,
	outOnLoan,
	payroll,
	players,
	season,
	spectator,
	transferWindow,
	userAcademyPlayers,
	userPlayers,
	wageBudget,
	transferFunds,
}: View<"transferMarket">) => {
	useTitleBar({ title: "Transfer Market" });

	const { challengeNoRatings } = useLocal(["challengeNoRatings"]);

	const canAct = transferWindow !== undefined && !spectator;

	const acceptOffer = async (offer: Offer) => {
		const name = `${offer.firstName} ${offer.lastName}`;
		const proceed = await confirm(
			offer.loan
				? `Loan ${name} to the ${offer.buyerAbbrev} until the summer? They'll play him and pay his wages.`
				: `Sell ${name} to the ${offer.buyerAbbrev} for ${formatMillions(offer.offerFee)}?`,
			{
				okText: offer.loan ? "Loan" : "Sell",
			},
		);
		if (proceed) {
			showError(
				await toWorker("main", "acceptTransferOffer", {
					pid: offer.pid,
					tid: offer.buyerTid,
				}),
			);
		}
	};

	const playerCells = (p: MarketPlayer) => [
		wrappedPlayerNameLabels({
			injury: p.injury,
			pid: p.pid,
			season,
			skills: p.ratings.skills,
			defaultWatch: p.watch,
			firstName: p.firstName,
			firstNameShort: p.firstNameShort,
			lastName: p.lastName,
		}),
		p.ratings.pos,
		p.age,
		!challengeNoRatings ? p.ratings.ovr : null,
		!challengeNoRatings ? p.ratings.pot : null,
	];

	const teamCell = (abbrev: string, tid: number) => ({
		value: (
			<a href={helpers.leagueUrl(["roster", `${abbrev}_${tid}`, season])}>
				{abbrev}
			</a>
		),
		sortValue: abbrev,
		searchValue: abbrev,
	});

	const feeCol = {
		title: "Fee",
		desc: "Transfer fee at market value. A club asks more for a player it would miss.",
		sortSequence: ["desc", "asc"],
		sortType: "number",
	} as const;

	const buttonsCol = {
		title: "",
		sortSequence: [],
	};

	const offerCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Contract", "Exp"]),
		{
			title: "From",
		},
		{
			title: "Division",
		},
		{
			...feeCol,
			title: "Offer",
			desc: "The fee they're offering",
		},
		{
			title: "Days",
			desc: "Days left until the offer runs out",
			sortSequence: ["asc", "desc"],
			sortType: "number",
		} as const,
		buttonsCol,
	];

	const offerRows: DataTableRow[] = offers.map((offer) => ({
		key: `${offer.pid}-${offer.buyerTid}`,
		metadata: {
			type: "player",
			pid: offer.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(offer),
			// An academy player has no contract, just the summer he has to leave
			...(offer.academy
				? ["Academy", offer.graduationSeason]
				: [wrappedContractAmount(offer), wrappedContractExp(offer)]),
			teamCell(offer.buyerAbbrev, offer.buyerTid),
			offer.buyerDivisionName,
			{
				value: offer.loan ? "Loan" : formatMillions(offer.offerFee),
				sortValue: offer.offerFee,
			},
			offer.daysLeft,
			<div className="d-flex gap-1" key="buttons">
				<button
					className="btn btn-xs btn-primary"
					disabled={!canAct}
					onClick={() => acceptOffer(offer)}
				>
					Accept
				</button>
				<button
					className="btn btn-xs btn-light-bordered"
					disabled={spectator}
					onClick={async () => {
						showError(
							await toWorker("main", "rejectTransferOffer", {
								pid: offer.pid,
								tid: offer.buyerTid,
							}),
						);
					}}
				>
					Reject
				</button>
			</div>,
		],
	}));

	const offersCol = {
		title: "Offers",
		desc: "Open offers from other clubs",
		sortSequence: ["desc", "asc"],
		sortType: "number",
	} as const;

	const transferListCol = {
		title: "Transfer list",
		desc: "Clubs make more offers for players on your transfer list, though for less",
		sortSequence: [],
	};

	const leavesCol = {
		title: "Leaves",
		desc: "The summer he has to leave his academy, for the first team or free agency",
		sortSequence: ["asc", "desc"],
		sortType: "number",
	} as const;

	const academyFeeCol = {
		...feeCol,
		desc: "Transfer fee at market value, mostly from his potential. A club asks double for the best player in its academy.",
	};

	const transferListButton = (p: { pid: number; transferListed: boolean }) => (
		<button
			className={
				p.transferListed
					? "btn btn-xs btn-secondary"
					: "btn btn-xs btn-light-bordered"
			}
			disabled={spectator}
			key="list"
			onClick={async () => {
				showError(
					await toWorker("main", "setTransferListed", {
						pid: p.pid,
						listed: !p.transferListed,
					}),
				);
			}}
		>
			{p.transferListed ? "Listed" : "List"}
		</button>
	);

	const loanListCol = {
		title: "Loan list",
		desc: "Clubs ask to borrow players on your loan list until the summer",
		sortSequence: [],
	};

	const loanListButton = (p: {
		pid: number;
		loanListed: boolean;
		loanEndSeason: number | undefined;
	}) =>
		p.loanEndSeason !== undefined ? null : (
			<button
				className={
					p.loanListed
						? "btn btn-xs btn-secondary"
						: "btn btn-xs btn-light-bordered"
				}
				disabled={spectator}
				key="loanList"
				onClick={async () => {
					showError(
						await toWorker("main", "setLoanListed", {
							pid: p.pid,
							listed: !p.loanListed,
						}),
					);
				}}
			>
				{p.loanListed ? "Listed" : "List"}
			</button>
		);

	const userCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Contract", "Exp"]),
		feeCol,
		offersCol,
		transferListCol,
		loanListCol,
	];

	const userRows: DataTableRow[] = userPlayers.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(p),
			wrappedContractAmount(p),
			wrappedContractExp(p),
			{
				value: formatMillions(p.fee),
				sortValue: p.fee,
			},
			p.transferOffers.length,
			transferListButton(p),
			loanListButton(p),
		],
	}));

	const userAcademyCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot"]),
		leavesCol,
		academyFeeCol,
		offersCol,
		transferListCol,
		loanListCol,
	];

	const userAcademyRows: DataTableRow[] = userAcademyPlayers.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(p),
			p.graduationSeason,
			{
				value: formatMillions(p.fee),
				sortValue: p.fee,
			},
			p.transferOffers.length,
			transferListButton(p),
			loanListButton(p),
		],
	}));

	const outOnLoanCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]),
		{
			title: "Division",
		},
		...getCols(["Contract"]),
		{
			title: "Until",
			desc: "He goes back to your club in the summer of this season",
			sortSequence: ["asc", "desc"],
			sortType: "number",
		} as const,
	];

	const outOnLoanRows: DataTableRow[] = outOnLoan.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(p),
			teamCell(p.abbrev, p.tid),
			p.divisionName,
			wrappedContractAmount(p),
			p.loanEndSeason,
		],
	}));

	const marketCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]),
		{
			title: "Division",
		},
		...getCols(["Contract", "Exp"]),
		feeCol,
		buttonsCol,
	];

	const marketRows: DataTableRow[] = players.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(p),
			teamCell(p.abbrev, p.tid),
			p.divisionName,
			wrappedContractAmount(p),
			wrappedContractExp(p),
			{
				value: formatMillions(p.fee),
				sortValue: p.fee,
			},
			<div className="d-flex gap-1" key="buttons">
				<button
					className="btn btn-xs btn-primary"
					disabled={!canAct || p.untradableMsg !== undefined}
					onClick={() =>
						makeOffer({ ...p, name: `${p.firstName} ${p.lastName}` })
					}
					title={p.untradableMsg}
				>
					Make offer
				</button>
				<button
					className="btn btn-xs btn-light-bordered"
					disabled={!canAct || p.untradableMsg !== undefined}
					onClick={() => requestLoan(p)}
					title={
						p.untradableMsg ??
						"Ask to borrow him until the summer. You'd pay his wages."
					}
				>
					Borrow
				</button>
			</div>,
		],
	}));

	const academyCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]),
		{
			title: "Division",
		},
		leavesCol,
		academyFeeCol,
		buttonsCol,
	];

	const academyRows: DataTableRow[] = academyPlayers.map((p) => ({
		key: p.pid,
		metadata: {
			type: "player",
			pid: p.pid,
			season,
			playoffs: "regularSeason",
		},
		data: [
			...playerCells(p),
			{
				value: (
					<a href={helpers.leagueUrl(["academy", `${p.abbrev}_${p.tid}`])}>
						{p.abbrev}
					</a>
				),
				sortValue: p.abbrev,
				searchValue: p.abbrev,
			},
			p.divisionName,
			p.graduationSeason,
			{
				value: formatMillions(p.fee),
				sortValue: p.fee,
			},
			<div className="d-flex gap-1" key="buttons">
				<button
					className="btn btn-xs btn-primary"
					disabled={!canAct}
					onClick={() =>
						makeOffer({
							...p,
							name: `${p.firstName} ${p.lastName}`,
							academy: true,
						})
					}
				>
					Make offer
				</button>
				<button
					className="btn btn-xs btn-light-bordered"
					disabled={!canAct || !p.canLoan}
					onClick={() => requestLoan(p)}
					title={
						p.canLoan
							? "Ask to borrow him until the summer, if his club doesn't think he's ready for its first team. You'd pay him the minimum wage."
							: `Academy players can go on loan once they're ${loanMinAge}, until the summer they have to leave`
					}
				>
					Borrow
				</button>
			</div>,
		],
	}));

	return (
		<>
			<p>
				{transferWindow
					? `The ${transferWindow} transfer window is open.`
					: "The transfer window is closed. The winter window opens late in the regular season, up to the trade deadline, and the summer window opens when the regular season ends."}{" "}
				Your club has {formatMillions(cash)} in cash, so it can spend up to{" "}
				<b>{formatMillions(transferFunds)}</b> on transfer fees (your board lets
				you go into debt down to half your wage budget). Your payroll is{" "}
				{formatMillions(payroll)} against a wage budget of{" "}
				{formatMillions(wageBudget)}, with {numPlayersOnRoster} of{" "}
				{maxRosterSize} players. A player keeps his contract when he moves, and
				your board won't let a transfer take your payroll over budget.
			</p>

			<h2>Offers for your players</h2>
			{offerRows.length > 0 ? (
				<DataTable
					cols={offerCols}
					defaultSort={[9, "desc"]}
					name="TransferMarketOffers"
					rows={offerRows}
				/>
			) : (
				<p>
					No open offers. While a window is open, other clubs make offers for
					players they want, and each offer stays open for a few days.
				</p>
			)}

			<h2>Your players</h2>
			<p>
				Put players on your transfer list for clubs to make offers for them, or
				on your loan list for clubs to ask to borrow them until the summer. A
				player on loan plays for the club that borrows him, which pays his
				wages.
			</p>
			<DataTable
				cols={userCols}
				defaultSort={[7, "desc"]}
				name="TransferMarketUser"
				rows={userRows}
			/>

			<h2>Your academy players</h2>
			<p>
				Clubs make offers for your academy players too, and one you sell joins
				the buying club's academy. Put academy players {loanMinAge} or older on
				your loan list for clubs to ask to borrow them until the summer, on the
				minimum wage.
			</p>
			<DataTable
				cols={userAcademyCols}
				defaultSort={[6, "desc"]}
				name="TransferMarketUserAcademy"
				rows={userAcademyRows}
			/>

			{outOnLoanRows.length > 0 ? (
				<>
					<h2>Your players out on loan</h2>
					<DataTable
						cols={outOnLoanCols}
						defaultSort={[0, "asc"]}
						name="TransferMarketOutOnLoan"
						rows={outOnLoanRows}
					/>
				</>
			) : null}

			<h2>Other clubs' players</h2>
			<p>
				Make an offer for a player at another club: it accepts its asking price,
				counters a close offer with it, and turns down the rest. Or ask to
				borrow him until the summer, for no fee: clubs only lend players 23 or
				younger who aren't in their rotation.
			</p>
			<DataTable
				cols={marketCols}
				defaultSort={[9, "desc"]}
				name="TransferMarket"
				rows={marketRows}
			/>

			<h2>Other clubs' academy players</h2>
			<p>
				You can borrow academy players {loanMinAge} or older until the summer,
				on the minimum wage, if their club doesn't think they're ready for its
				first team. A player you buy from another club's academy joins yours, so
				he doesn't take a roster spot or count against your wage budget until
				you promote him.
			</p>
			<DataTable
				cols={academyCols}
				defaultSort={[8, "desc"]}
				name="TransferMarketAcademy"
				rows={academyRows}
			/>
		</>
	);
};

export default TransferMarket;
