import type { UpdateEvents, ViewInput } from "../../common/types.ts";
import { competition } from "../core/index.ts";

/**
 * International Soccer Zen GM mod (storytelling): a World's Chronicle, the
 * stories and results of a finished season in every Country
 */
const updateWorldChronicle = async (
	{ season }: ViewInput<"worldChronicle">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("newPhase") ||
		state.season !== season
	) {
		const chronicle = await competition.getWorldChronicle(season);
		if (!chronicle) {
			return {
				errorMessage:
					"The Chronicle only exists in a World, a league with more than one Division.",
			};
		}
		return chronicle;
	}
};

export default updateWorldChronicle;
