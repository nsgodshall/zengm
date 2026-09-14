import type { UpdateEvents, ViewInput } from "../../common/types.ts";
import { competition } from "../core/index.ts";
import {
	getAcademyAges,
	getAcademyContract,
} from "../core/competition/youthAcademy.ts";
import {
	getAcademyPlayerFee,
	isAcademyPlayerForSale,
} from "../core/competition/academyTransfers.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";

/**
 * International Soccer Zen GM mod (Epic 6): one club's youth academy, where the
 * user promotes academy players to the first team or releases them
 */
const updateAcademy = async (
	inputs: ViewInput<"academy">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("newPhase") ||
		inputs.tid !== state.tid
	) {
		if (competition.isSingleDivision(competition.getCompetitionStructure())) {
			return {
				errorMessage:
					"Youth academies only exist in a World, a league with more than one Division.",
			};
		}

		const season = g.get("season");
		const phase = g.get("phase");

		const academyPlayers = await competition.getAcademyPlayers(inputs.tid);
		const playersPlus = await idb.getCopies.playersPlus(academyPlayers, {
			attrs: [
				"pid",
				"firstName",
				"lastName",
				"age",
				"draft",
				"watch",
				"valueFuzz",
				"transferListed",
			],
			ratings: ["ovr", "pot", "skills", "pos"],
			showNoStats: true,
			showRookies: true,
			fuzz: true,
		});

		const players = addFirstNameShort(
			playersPlus
				.map((p) => {
					const ratings = p.ratings.at(-1);
					const raw = academyPlayers.find((p2) => p2.pid === p.pid)!;
					return {
						// International Soccer Zen GM mod (Epic 6): for the transfer
						// buttons, the fee in millions of dollars like contracts
						fee: getAcademyPlayerFee(raw) / 1000,
						forSale: isAcademyPlayerForSale(raw),
						transferListed: !!p.transferListed,
						pid: p.pid as number,
						firstName: p.firstName as string,
						lastName: p.lastName as string,
						age: p.age as number,
						watch: p.watch,
						valueFuzz: p.valueFuzz as number,
						ovr: ratings.ovr as number,
						pot: ratings.pot as number,
						skills: ratings.skills as string[],
						pos: ratings.pos as string,
						graduationSeason: p.draft.year as number,
						graduating: (p.draft.year as number) <= season,
					};
				})
				.sort((a, b) => b.valueFuzz - a.valueFuzz),
		);

		// Academy strength rank, 1 is best
		const clubs = await competition.getAcademyClubs();
		clubs.sort((a, b) => b.strength - a.strength);
		const academyRank =
			clubs.findIndex((club) => club.tid === inputs.tid) + 1 || undefined;

		const numPlayersOnRoster = (
			await idb.cache.players.indexGetAll("playersByTid", inputs.tid)
		).length;

		return {
			abbrev: inputs.abbrev,
			academyRank,
			canManage: inputs.tid === g.get("userTid") && !g.get("spectator"),
			contract: getAcademyContract({
				season,
				phase,
				minContract: g.get("minContract"),
			}),
			graduationAge: getAcademyAges(g.get("draftAges")).graduationAge,
			maxRosterSize: g.get("maxRosterSize"),
			numClubs: clubs.length,
			numPlayersOnRoster,
			phase,
			players,
			season,
			tid: inputs.tid,
			// International Soccer Zen GM mod (Epic 6): for the transfer buttons
			isUserClub: g.get("userTids").includes(inputs.tid),
			transferWindow: await competition.getCurrentTransferWindow(),
		};
	}
};

export default updateAcademy;
