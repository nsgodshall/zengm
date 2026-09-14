import { confirm } from "./confirm.tsx";
import { helpers } from "./helpers.ts";
import { showNotification } from "./showNotification.ts";
import { toWorker } from "./toWorker.ts";

// International Soccer Zen GM mod (Epic 6): the transfer and loan actions shared
// by the Transfer Market, player pages, and academy pages

export type TransferTarget = {
	pid: number;
	abbrev: string;
	name: string;
	// Millions of dollars
	fee: number;
	academy?: boolean;
};

// Amounts in these actions are in millions of dollars
export const formatMillions = (amount: number) =>
	helpers.formatCurrency(amount, "M");

export const showTransferError = (errorMsg: string | undefined | void) => {
	if (errorMsg) {
		showNotification({
			type: "error",
			text: errorMsg,
		});
	}
};

// fee is in thousands of dollars, like contracts in the worker
const submitOffer = async (p: TransferTarget, fee: number): Promise<void> => {
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

/**
 * Asks the user what fee to offer for a player at another club, in its first
 * team or its academy, and makes the offer
 */
export const makeTransferOffer = async (p: TransferTarget) => {
	const input = await confirm(
		`How much do you offer the ${p.abbrev} for ${p.name}, in millions of dollars? At market value the fee is about ${formatMillions(p.fee)}, but ${p.academy ? "a club asks double for the best player in its academy" : "a club asks more for a player it would miss"}.`,
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
		showTransferError("Enter a fee in millions of dollars, like 12.5.");
		return;
	}

	await submitOffer(p, Math.round(millions * 1000));
};

/** Asks an AI club to lend the user one of its players until the summer */
export const requestLoan = async (p: { pid: number }) => {
	const result = await toWorker("main", "requestLoan", { pid: p.pid });
	showNotification({
		type: result.type === "accept" ? "success" : "error",
		text: result.message,
	});
};
