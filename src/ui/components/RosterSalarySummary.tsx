import { HelpPopover } from "./HelpPopover.tsx";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";

export const RosterSalarySummary = ({
	capSpace,
	numRosterSpots,
	payroll,
	wageBudget,
}: {
	capSpace: number;
	numRosterSpots: number;
	payroll: number;
	// International Soccer Zen GM mod (Epic 4): in a World, the most the user's
	// board lets them spend on wages, in millions of dollars
	wageBudget?: number;
}) => {
	const { luxuryPayroll, maxContract, minContract, salaryCapType } = useLocal([
		"luxuryPayroll",
		"maxContract",
		"minContract",
		"salaryCapType",
	]);

	const actualCapSpace = capSpace > 0 ? capSpace : 0;

	return (
		<div className="mb-3">
			You currently have <b>{numRosterSpots}</b> open roster spots
			{wageBudget !== undefined ? (
				<>
					{" "}
					and a{" "}
					<b className={payroll > wageBudget ? "text-danger" : undefined}>
						{helpers.formatCurrency(payroll, "M")}
					</b>{" "}
					payroll against your wage budget of{" "}
					<b>{helpers.formatCurrency(wageBudget, "M")}</b>. Your board won't let
					a signing above the minimum contract take you over it.
				</>
			) : salaryCapType === "none" ? (
				<>
					{" "}
					and a <b>{helpers.formatCurrency(payroll, "M")}</b> payroll (luxury
					tax limit: {helpers.formatCurrency(luxuryPayroll / 1000, "M")}).
				</>
			) : (
				<>
					{" "}
					and{" "}
					<b className={actualCapSpace > 0 ? "text-success" : undefined}>
						{helpers.formatCurrency(actualCapSpace, "M")}
					</b>{" "}
					in cap space
					{capSpace < 0 ? (
						<>
							{" "}
							(
							<b className="text-danger">
								{helpers.formatCurrency(Math.abs(capSpace), "M")}
							</b>{" "}
							over the cap)
						</>
					) : null}
					.{" "}
					<HelpPopover title="Cap Space">
						<p>
							"Cap space" is the difference between your current payroll and the
							salary cap.
						</p>
						<p>
							{salaryCapType === "hard"
								? "You "
								: "After the season you can go over the salary cap to re-sign your own players. Besides that, you "}
							can only exceed the salary cap to sign players to minimum
							contracts ({helpers.formatCurrency(minContract / 1000, "M")}
							/year).
						</p>
					</HelpPopover>
				</>
			)}
			<br />
			Min contract: {helpers.formatCurrency(minContract / 1000, "M")}
			<br />
			{wageBudget === undefined ? (
				<>
					Max contract: {helpers.formatCurrency(maxContract / 1000, "M")}
					<br />
				</>
			) : null}
		</div>
	);
};
