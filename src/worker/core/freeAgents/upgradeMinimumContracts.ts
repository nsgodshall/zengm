import { PLAYER } from "../../../common/constants.ts";
import type { Player } from "../../../common/types.ts";
import { shuffle } from "../../../common/random.ts";
import { idb } from "../../db/index.ts";
import { g, local } from "../../util/index.ts";
import { player, team } from "../index.ts";
import { getCompetitionStructure } from "../competition/ensureCompetitionStructure.ts";
import { isSingleDivision } from "../competition/competitionStructure.ts";

export const MINIMUM_CONTRACT_UPGRADE_VALUE_GAIN = 8;
export const MINIMUM_CONTRACT_UPGRADE_ROUNDS = 2;

export const orderMinimumContractUpgradeTeams = <T extends { tier: number }>(
	teams: T[],
) => [...teams].sort((a, b) => b.tier - a.tier);

export const getMinimumContractUpgrade = ({
	roster,
	freeAgents,
	minContract,
	minimumValueGain = MINIMUM_CONTRACT_UPGRADE_VALUE_GAIN,
}: {
	roster: Player[];
	freeAgents: Player[];
	minContract: number;
	minimumValueGain?: number;
}) => {
	const replace = roster
		.filter((p) => p.loan === undefined && p.contract.amount <= minContract)
		.sort((a, b) => a.valueNoPot - b.valueNoPot)[0];
	const sign = freeAgents
		.filter(
			(p) =>
				p.contract.amount <= minContract &&
				p.injury.gamesRemaining === 0 &&
				replace !== undefined &&
				p.valueNoPot >= replace.valueNoPot + minimumValueGain,
		)
		.sort((a, b) => b.valueNoPot - a.valueNoPot)[0];

	return replace && sign ? { replace, sign } : undefined;
};

/**
 * Fair rounds let every AI club make one clear minimum-wage upgrade before
 * any club gets another turn at the shared free-agent pool.
 */
const upgradeMinimumContracts = async () => {
	if (isSingleDivision(getCompetitionStructure())) {
		return 0;
	}

	const available = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	const tierByDivisionId = new Map(
		getCompetitionStructure().competitionDivisions.map((division) => [
			division.divisionId,
			division.tier,
		]),
	);
	let numUpgraded = 0;

	for (let round = 0; round < MINIMUM_CONTRACT_UPGRADE_ROUNDS; round++) {
		shuffle(teams);
		const orderedTeams = orderMinimumContractUpgradeTeams(
			teams.map((team) => ({
				team,
				tier:
					team.divisionId === undefined
						? 1
						: (tierByDivisionId.get(team.divisionId) ?? 1),
			})),
		);
		for (const { team: t } of orderedTeams) {
			if (
				g.get("userTids").includes(t.tid) &&
				!local.autoPlayUntil &&
				!g.get("spectator")
			) {
				continue;
			}

			const roster = await idb.cache.players.indexGetAll("playersByTid", t.tid);
			const upgrade = getMinimumContractUpgrade({
				roster,
				freeAgents: available,
				minContract: g.get("minContract"),
			});
			if (!upgrade) {
				continue;
			}

			await player.release(upgrade.replace, false);
			await player.sign(
				upgrade.sign,
				t.tid,
				upgrade.sign.contract,
				g.get("phase"),
			);
			await idb.cache.players.put(upgrade.sign);
			available.splice(available.indexOf(upgrade.sign), 1);
			await team.rosterAutoSort(t.tid);
			numUpgraded += 1;
		}
	}

	return numUpgraded;
};

export default upgradeMinimumContracts;
