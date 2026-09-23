import { PHASE } from "../../common/constants.ts";
import { competition, finances, team } from "../core/index.ts";
import { getWageBudgets } from "../core/competition/wageBudgets.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import type {
	TeamSeason,
	UpdateEvents,
	ViewInput,
} from "../../common/types.ts";
import { getAutoTicketPriceByTid } from "../core/game/attendance.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";
import {
	getWorldInfrastructureSummary,
	projectWorldClubFinances,
} from "../core/competition/worldInfrastructure.ts";
import { getProjectedRevenue } from "../core/competition/worldRevenue.ts";

const updateTeamFinances = async (
	inputs: ViewInput<"teamFinances">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("teamFinances") ||
		inputs.tid !== state.tid ||
		inputs.show !== state.show
	) {
		const contractsRaw = await team.getContracts(inputs.tid);
		let payroll = await team.getPayroll(contractsRaw);
		const payrollRaw = payroll;
		const luxuryTaxAmount = finances.getLuxuryTaxAmount(payroll) / 1000;
		const minPayrollAmount = finances.getMinPayrollAmount(payroll) / 1000;
		payroll /= 1000;

		let showInt;

		if (inputs.show === "all") {
			showInt = g.get("season") - g.get("startingSeason") + 1;
		} else {
			showInt = Number.parseInt(inputs.show);
		}

		let season = g.get("season");
		if (g.get("phase") >= PHASE.DRAFT) {
			// After the draft, don't show old contract year
			season += 1;
		}

		// How many seasons into the future are contracts?
		let maxContractExp = -Infinity;
		for (const contract of contractsRaw) {
			if (contract.exp > maxContractExp) {
				maxContractExp = contract.exp;
			}
		}
		const numSeasons = Math.max(
			g.get("maxContractLength"),
			maxContractExp - season + 1,
		);

		// Convert contract objects into table rows
		const contractTotals = Array(numSeasons).fill(0);
		const contracts = addFirstNameShort(
			contractsRaw.map((contract) => {
				const amounts: number[] = [];

				for (let i = season; i <= contract.exp; i++) {
					amounts.push(contract.amount / 1000);
					if (contractTotals[i - season] !== undefined) {
						contractTotals[i - season] += contract.amount / 1000;
					}
				}

				return {
					pid: contract.pid,
					firstName: contract.firstName,
					lastName: contract.lastName,
					skills: contract.skills,
					pos: contract.pos,
					injury: contract.injury,
					jerseyNumber: contract.jerseyNumber,
					watch: contract.watch,
					released: contract.released,
					amounts,
					capPct: (100 * contract.amount) / g.get("salaryCap"),
				};
			}),
		);

		const salariesSeasons = [];
		for (let i = 0; i < numSeasons; i++) {
			salariesSeasons.push(season + i);
		}

		const teamSeasons = await idb.getCopies.teamSeasons({
			tid: inputs.tid,
		});
		teamSeasons.reverse(); // Most recent season first

		// Add in luxuryTaxShare if it's missing
		for (const teamSeason of teamSeasons) {
			if (!teamSeason.revenues.luxuryTaxShare) {
				teamSeason.revenues.luxuryTaxShare = 0;
			}
		}

		const formatRevenueExpenses = (teamSeason: TeamSeason) => {
			const output = {} as Record<
				| `expenses${Capitalize<keyof TeamSeason["expenses"]>}`
				| `revenues${Capitalize<keyof TeamSeason["revenues"]>}`,
				number
			>;
			for (const key of helpers.keys(teamSeason.revenues)) {
				const outputKey = `revenues${helpers.upperCaseFirstLetter(
					key,
				)}` as const;
				output[outputKey] = teamSeason.revenues[key];
			}
			for (const key of helpers.keys(teamSeason.expenses)) {
				const outputKey = `expenses${helpers.upperCaseFirstLetter(
					key,
				)}` as const;
				output[outputKey] = teamSeason.expenses[key];
			}
			return output;
		};

		const barData = teamSeasons.slice(0, showInt).map((teamSeason) => {
			const att = teamSeason.att / teamSeason.gpHome;

			const numPlayoffRounds = g.get(
				"numGamesPlayoffSeries",
				teamSeason.season,
			).length;

			const champ = teamSeason.playoffRoundsWon === numPlayoffRounds;

			const row = {
				season: teamSeason.season,
				champ,
				att,
				cash: teamSeason.cash / 1000, // convert to millions
				won: teamSeason.won,
				hype: teamSeason.hype,
				pop: teamSeason.pop,
				...formatRevenueExpenses(teamSeason),
			};

			return row;
		});

		// Pad with 0s
		while (barData.length > 0 && barData.length < showInt) {
			const row = helpers.deepCopy(barData.at(-1)!);
			row.season -= 1;
			for (const key of helpers.keys(row)) {
				if (key !== "season" && key !== "champ") {
					row[key] = 0;
				}
			}
			barData.push(row);
		}

		// Get stuff for the finances form
		const tTemp = await idb.getCopy.teamsPlus(
			{
				attrs: [
					"budget",
					"adjustForInflation",
					"autoTicketPrice",
					"worldInfrastructure",
				],
				seasonAttrs: ["expenses"],
				season: g.get("season"),
				tid: inputs.tid,
				addDummySeason: true,
			},
			"noCopyCache",
		);

		if (!tTemp) {
			throw new Error("Team not found");
		}

		const t = tTemp as typeof tTemp & {
			autoTicketPrice: boolean;
			expenseLevelsLastThree: TeamSeason["expenseLevels"];
		};

		// undefined is true (for upgrades), and AI teams are always true
		t.autoTicketPrice =
			t.autoTicketPrice !== false || !g.get("userTids").includes(inputs.tid);

		// Undo reverse from above
		const teamSeasonsLastThree = teamSeasons.slice(0, 3).reverse();
		t.expenseLevelsLastThree = {
			coaching: await finances.getLevelLastThree("coaching", {
				tid: inputs.tid,
				teamSeasons: teamSeasonsLastThree,
			}),
			facilities: await finances.getLevelLastThree("facilities", {
				tid: inputs.tid,
				teamSeasons: teamSeasonsLastThree,
			}),
			health: await finances.getLevelLastThree("health", {
				tid: inputs.tid,
				teamSeasons: teamSeasonsLastThree,
			}),
			scouting: await finances.getLevelLastThree("scouting", {
				tid: inputs.tid,
				teamSeasons: teamSeasonsLastThree,
			}),
		};

		const maxStadiumCapacity = teamSeasons.reduce((max, teamSeason) => {
			if (teamSeason.stadiumCapacity > max) {
				return teamSeason.stadiumCapacity;
			}

			return max;
		}, 0);

		const autoTicketPrice = await getAutoTicketPriceByTid(inputs.tid);

		const otherTeamTicketPrices = [];
		const teams = await idb.cache.teams.getAll();
		for (const t of teams) {
			if (!t.disabled && t.tid !== inputs.tid) {
				if (t.autoTicketPrice) {
					otherTeamTicketPrices.push(await getAutoTicketPriceByTid(t.tid));
				} else {
					otherTeamTicketPrices.push(t.budget.ticketPrice);
				}
			}
		}
		otherTeamTicketPrices.sort((a, b) => b - a);

		const structure = competition.getCompetitionStructure();
		const world = !competition.isSingleDivision(structure);
		const currentTeam = await idb.cache.teams.get(inputs.tid);
		const infrastructure = world
			? getWorldInfrastructureSummary(currentTeam?.worldInfrastructure).map(
					(asset) => ({ ...asset, invested: asset.invested / 1000 }),
				)
			: undefined;
		const ledger = world
			? teamSeasons.slice(0, showInt).map((teamSeason) => {
					const finance = teamSeason.worldFinance;
					const operatingRevenue = Object.values(teamSeason.revenues).reduce(
						(total, amount) => total + amount,
						0,
					);
					const operations =
						teamSeason.expenses.coaching +
						teamSeason.expenses.facilities +
						teamSeason.expenses.health +
						teamSeason.expenses.scouting;
					return {
						season: teamSeason.season,
						operatingRevenue: operatingRevenue / 1000,
						wages: teamSeason.expenses.salary / 1000,
						operations: operations / 1000,
						transferFeesPaid: (finance?.transferFeesPaid ?? 0) / 1000,
						transferFeesReceived: (finance?.transferFeesReceived ?? 0) / 1000,
						capitalProjects: (finance?.capitalProjects ?? 0) / 1000,
						debtInterest: (finance?.debtInterest ?? 0) / 1000,
						ownerFunding: (finance?.ownerFunding ?? 0) / 1000,
						prizeMoney: (finance?.prizeMoney ?? 0) / 1000,
						closingCash: teamSeason.cash / 1000,
						closingDebt: Math.max(0, -teamSeason.cash) / 1000,
					};
				})
			: undefined;

		let financeProjection;
		let promotionSpendingLimit;
		if (world && currentTeam) {
			const completed = teamSeasons.find(
				(teamSeason) => teamSeason.season < g.get("season"),
			);
			const current = teamSeasons.find(
				(teamSeason) => teamSeason.season === g.get("season"),
			);
			if (completed) {
				const divisionById = new Map(
					structure.competitionDivisions.map((division) => [
						division.divisionId,
						division,
					]),
				);
				const previousDivision =
					completed.divisionId === undefined
						? undefined
						: divisionById.get(completed.divisionId);
				const currentDivision =
					currentTeam.divisionId === undefined
						? undefined
						: divisionById.get(currentTeam.divisionId);
				const revenue = Object.values(completed.revenues).reduce(
					(total, amount) => total + amount,
					0,
				);
				const projectedRevenue =
					previousDivision && currentDivision
						? getProjectedRevenue({
								revenue,
								nationalTv: completed.revenues.nationalTv,
								lastTier: previousDivision.tier,
								tier: currentDivision.tier,
							})
						: revenue;
				const runningCosts =
					completed.expenses.coaching +
					completed.expenses.facilities +
					completed.expenses.health +
					completed.expenses.scouting;
				financeProjection = projectWorldClubFinances({
					season: g.get("season"),
					cash: current?.cash ?? completed.cash,
					revenue: projectedRevenue,
					runningCosts,
					payroll: payrollRaw,
				}).map((row) => ({
					...row,
					cash: row.cash / 1000,
					debt: row.debt / 1000,
					interest: row.interest / 1000,
					operatingResult: row.operatingResult / 1000,
				}));
				promotionSpendingLimit =
					(current?.worldFinance?.promotionSpendingLimit ?? 0) / 1000;
			}
		}

		return {
			abbrev: inputs.abbrev,
			autoTicketPrice,
			tid: inputs.tid,
			show: inputs.show,
			minPayrollAmount,
			luxuryTaxAmount,
			maxStadiumCapacity,
			t,
			barData,
			payroll,
			// International Soccer Zen GM mod (Epic 4): undefined outside a World
			wageBudget: competition.isSingleDivision(
				competition.getCompetitionStructure(),
			)
				? undefined
				: ((await getWageBudgets()).get(inputs.tid) ?? 0) / 1000,
			contracts,
			contractTotals,
			salariesSeasons,
			otherTeamTicketPrices,
			infrastructure,
			ledger,
			financeProjection,
			promotionSpendingLimit,
		};
	}
};

export default updateTeamFinances;
