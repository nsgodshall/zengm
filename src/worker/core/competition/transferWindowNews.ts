import { PHASE } from "../../../common/constants.ts";
import { g, helpers, local, logEvent } from "../../util/index.ts";
import { season } from "../index.ts";
import { isSingleDivision } from "./competitionStructure.ts";
import { getCompetitionStructure } from "./ensureCompetitionStructure.ts";
import { getWinterWindowDays } from "./transferMarket.ts";

// How many days before the winter window closes the user is reminded
export const WINDOW_CLOSING_REMINDER_DAYS = 3;

/**
 * International Soccer Zen GM mod (Epic 6): like Football Manager's transfer
 * window news, the user hears when the winter window opens and gets a reminder
 * a few days before it closes. Run once a day in the regular season, after
 * that day's games, like the AI transfers.
 */
const transferWindowNews = async () => {
	if (
		isSingleDivision(getCompetitionStructure()) ||
		g.get("phase") !== PHASE.REGULAR_SEASON ||
		local.autoPlayUntil ||
		g.get("spectator")
	) {
		return;
	}

	// The same days getCurrentTransferWindow goes by
	const schedule = await season.getSchedule();
	const today = schedule[0]?.day;
	const lastDay = schedule.at(-1)?.day;
	if (today === undefined || lastDay === undefined) {
		return;
	}

	const days = getWinterWindowDays({
		lastDay,
		tradeDeadline: g.get("tradeDeadline"),
		deadlineDay: schedule.find(
			(game) => game.awayTid === -3 && game.homeTid === -3,
		)?.day,
	});
	if (!days || today < days.openDay || today >= days.closeDay) {
		return;
	}

	const daysLeft = days.closeDay - today;
	const daysLeftText = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
	const marketLink = `<a href="${helpers.leagueUrl(["transfer_market"])}">Transfer market</a>`;

	let text;
	if (today === days.openDay && days.openDay > 1) {
		text = `The winter transfer window is open, for the next ${daysLeftText}. ${marketLink}`;
	} else if (daysLeft === WINDOW_CLOSING_REMINDER_DAYS) {
		text = `The winter transfer window closes in ${daysLeftText}. After that, you can't buy, sell, or loan players until the season is over. ${marketLink}`;
	}

	if (text) {
		await logEvent({
			type: "transfer",
			text,
			showNotification: true,
			tids: g.get("userTids"),
		});
	}
};

export default transferWindowNews;
