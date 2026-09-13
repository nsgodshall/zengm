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

// International Soccer Zen GM mod (Epic 6): the user buys players from other
// clubs, from worker/views/transferMarket.ts

type MarketPlayer = View<"transferMarket">["players"][number];

// Amounts on this page are in millions of dollars
const formatMillions = (amount: number) => helpers.formatCurrency(amount, "M");

const TransferMarket = ({
	cash,
	maxRosterSize,
	numPlayersOnRoster,
	payroll,
	players,
	season,
	spectator,
	transferWindow,
	wageBudget,
}: View<"transferMarket">) => {
	useTitleBar({ title: "Transfer Market" });

	const { challengeNoRatings } = useLocal(["challengeNoRatings"]);

	// fee is in thousands of dollars, like contracts in the worker
	const submitOffer = async (p: MarketPlayer, fee: number) => {
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

	const makeOffer = async (p: MarketPlayer) => {
		const input = await confirm(
			`How much do you offer the ${p.abbrev} for ${p.firstName} ${p.lastName}, in millions of dollars? At market value the fee is about ${formatMillions(p.fee)}, but a club asks more for a player it would miss.`,
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
			showNotification({
				type: "error",
				text: "Enter a fee in millions of dollars, like 12.5.",
			});
			return;
		}

		await submitOffer(p, Math.round(millions * 1000));
	};

	const canOffer = transferWindow !== undefined && !spectator;

	const cols = [
		...getCols(["Name", "Pos", "Age", "Ovr", "Pot", "Team"]),
		{
			title: "Division",
		},
		...getCols(["Contract", "Exp"]),
		{
			title: "Fee",
			desc: "Transfer fee at market value. A club asks more for a player it would miss.",
			sortSequence: ["desc", "asc"],
			sortType: "number",
		} as const,
		{
			title: "",
			sortSequence: [],
		},
	];

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
			{
				value: (
					<a
						href={helpers.leagueUrl(["roster", `${p.abbrev}_${p.tid}`, season])}
					>
						{p.abbrev}
					</a>
				),
				sortValue: p.abbrev,
				searchValue: p.abbrev,
			},
			p.divisionName,
			wrappedContractAmount(p),
			wrappedContractExp(p),
			{
				value: formatMillions(p.fee),
				sortValue: p.fee,
			},
			<button
				className="btn btn-xs btn-primary"
				disabled={!canOffer || p.untradableMsg !== undefined}
				key="offer"
				onClick={() => makeOffer(p)}
				title={p.untradableMsg}
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
				Make an offer for a player at another club: it accepts its asking price,
				counters a close offer with it, and turns down the rest.
			</p>
			<p>
				Your club has {formatMillions(cash)} in cash and a payroll of{" "}
				{formatMillions(payroll)} against a wage budget of{" "}
				{formatMillions(wageBudget)}, with {numPlayersOnRoster} of{" "}
				{maxRosterSize} players. A player keeps his contract when he moves, and
				your board won't let a transfer take your payroll over budget.
			</p>

			<DataTable
				cols={cols}
				defaultSort={[9, "desc"]}
				name="TransferMarket"
				rows={rows}
			/>
		</>
	);
};

export default TransferMarket;
