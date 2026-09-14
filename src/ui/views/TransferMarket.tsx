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
import { showNotification } from "../util/showNotification.ts";
import { toWorker } from "../util/toWorker.ts";

// International Soccer Zen GM mod (Epic 6): the user's transfer business, from
// worker/views/transferMarket.ts

type MarketPlayer = View<"transferMarket">["players"][number];
type Offer = View<"transferMarket">["offers"][number];

type OfferTarget = {
	pid: number;
	abbrev: string;
	firstName: string;
	lastName: string;
	// Millions of dollars
	fee: number;
	academy?: boolean;
};

// Amounts on this page are in millions of dollars
const formatMillions = (amount: number) => helpers.formatCurrency(amount, "M");

const showError = (errorMsg: string | undefined | void) => {
	if (errorMsg) {
		showNotification({
			type: "error",
			text: errorMsg,
		});
	}
};

const TransferMarket = ({
	academyPlayers,
	cash,
	maxRosterSize,
	numPlayersOnRoster,
	offers,
	payroll,
	players,
	season,
	spectator,
	transferWindow,
	userPlayers,
	wageBudget,
}: View<"transferMarket">) => {
	useTitleBar({ title: "Transfer Market" });

	const { challengeNoRatings } = useLocal(["challengeNoRatings"]);

	const canAct = transferWindow !== undefined && !spectator;

	// fee is in thousands of dollars, like contracts in the worker
	const submitOffer = async (p: OfferTarget, fee: number) => {
		const result = await toWorker("main", "makeTransferOffer", {
			pid: p.pid,
			fee,
		});

		if (result.type === "counter") {
			const pay = await confirm(`${result.message} Pay their asking price?`, {
				okText: `Pay ${formatMillions(result.askingPrice / 1000)}`,
			});
			if (pay) {
				await submitOffer(p, result.askingPrice);
			}
		} else {
			showNotification({
				type: result.type === "accept" ? "success" : "error",
				text: result.message,
			});
		}
	};

	const makeOffer = async (p: OfferTarget) => {
		const input = await confirm(
			`How much do you offer the ${p.abbrev} for ${p.firstName} ${p.lastName}, in millions of dollars? At market value the fee is about ${formatMillions(p.fee)}, but ${p.academy ? "a club asks double for the best player in its academy" : "a club asks more for a player it would miss"}.`,
			{
				defaultValue: String(p.fee),
				okText: "Make offer",
			},
		);
		if (input === null) {
			return;
		}

		const millions = Number.parseFloat(input.replaceAll(/[^\d.]/g, ""));
		if (Number.isNaN(millions)) {
			showError("Enter a fee in millions of dollars, like 12.5.");
			return;
		}

		await submitOffer(p, Math.round(millions * 1000));
	};

	const acceptOffer = async (offer: Offer) => {
		const proceed = await confirm(
			`Sell ${offer.firstName} ${offer.lastName} to the ${offer.buyerAbbrev} for ${formatMillions(offer.offerFee)}?`,
			{
				okText: "Sell",
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
			wrappedContractAmount(offer),
			wrappedContractExp(offer),
			teamCell(offer.buyerAbbrev, offer.buyerTid),
			offer.buyerDivisionName,
			{
				value: formatMillions(offer.offerFee),
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

	const userCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Contract", "Exp"]),
		feeCol,
		{
			title: "Offers",
			desc: "Open offers from other clubs",
			sortSequence: ["desc", "asc"],
			sortType: "number",
		} as const,
		{
			title: "Transfer list",
			desc: "Clubs make more offers for players on your transfer list, though for less",
			sortSequence: [],
		},
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
			</button>,
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
			<button
				className="btn btn-xs btn-primary"
				disabled={!canAct || p.untradableMsg !== undefined}
				key="offer"
				onClick={() => makeOffer(p)}
				title={p.untradableMsg}
			>
				Make offer
			</button>,
		],
	}));

	const academyCols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]),
		{
			title: "Division",
		},
		{
			title: "Leaves",
			desc: "The summer he has to leave his academy, for the first team or free agency",
			sortSequence: ["asc", "desc"],
			sortType: "number",
		} as const,
		{
			...feeCol,
			desc: "Transfer fee at market value, mostly from his potential. A club asks double for the best player in its academy.",
		},
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
			<button
				className="btn btn-xs btn-primary"
				disabled={!canAct}
				key="offer"
				onClick={() => makeOffer({ ...p, academy: true })}
			>
				Make offer
			</button>,
		],
	}));

	return (
		<>
			<p>
				{transferWindow
					? `The ${transferWindow} transfer window is open.`
					: "The transfer window is closed. The winter window opens late in the regular season, up to the trade deadline, and the summer window opens when the regular season ends."}{" "}
				Your club has {formatMillions(cash)} in cash and a payroll of{" "}
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
			<DataTable
				cols={userCols}
				defaultSort={[7, "desc"]}
				name="TransferMarketUser"
				rows={userRows}
			/>

			<h2>Other clubs' players</h2>
			<p>
				Make an offer for a player at another club: it accepts its asking price,
				counters a close offer with it, and turns down the rest.
			</p>
			<DataTable
				cols={marketCols}
				defaultSort={[9, "desc"]}
				name="TransferMarket"
				rows={marketRows}
			/>

			<h2>Other clubs' academy players</h2>
			<p>
				A player you buy from another club's academy joins yours, so he doesn't
				take a roster spot or count against your wage budget until you promote
				him.
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
