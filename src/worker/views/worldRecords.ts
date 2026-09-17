import type { UpdateEvents } from "../../common/types.ts";
import { competition } from "../core/index.ts";

/**
 * International Soccer Zen GM mod (storytelling): each Country's records and
 * all-time top-tier table
 */
const updateWorldRecords = async (
	inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("newPhase") ||
		updateEvents.includes("gameSim")
	) {
		const countries = await competition.getWorldRecordsInfo();
		if (!countries) {
			return {
				errorMessage:
					"Records only exist in a World, a league with more than one Division.",
			};
		}
		return { countries };
	}
};

export default updateWorldRecords;
