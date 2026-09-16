import { expect, test } from "vitest";
import type { Player } from "../../../common/types.ts";
import {
	getMinimumContractUpgrade,
	MINIMUM_CONTRACT_UPGRADE_ROUNDS,
	MINIMUM_CONTRACT_UPGRADE_VALUE_GAIN,
	orderMinimumContractUpgradeTeams,
} from "./upgradeMinimumContracts.ts";

const fakePlayer = ({
	pid,
	value,
	amount = 1_200,
	injured = false,
}: {
	pid: number;
	value: number;
	amount?: number;
	injured?: boolean;
}) =>
	({
		pid,
		valueNoPot: value,
		contract: { amount },
		injury: { gamesRemaining: injured ? 5 : 0 },
	}) as Player;

test("replaces the weakest minimum player with a materially better healthy minimum free agent", () => {
	const upgrade = getMinimumContractUpgrade({
		roster: [
			fakePlayer({ pid: 1, value: 20 }),
			fakePlayer({ pid: 2, value: 35 }),
		],
		freeAgents: [
			fakePlayer({
				pid: 3,
				value: 20 + MINIMUM_CONTRACT_UPGRADE_VALUE_GAIN - 1,
			}),
			fakePlayer({ pid: 4, value: 50, injured: true }),
			fakePlayer({ pid: 5, value: 45 }),
		],
		minContract: 1_200,
	});

	expect(upgrade?.replace.pid).toBe(1);
	expect(upgrade?.sign.pid).toBe(5);
});

test("does nothing when the improvement is too small", () => {
	expect(
		getMinimumContractUpgrade({
			roster: [fakePlayer({ pid: 1, value: 20 })],
			freeAgents: [fakePlayer({ pid: 2, value: 27 })],
			minContract: 1_200,
		}),
	).toBeUndefined();
});

test("uses more than one fair upgrade round", () => {
	expect(MINIMUM_CONTRACT_UPGRADE_ROUNDS).toBeGreaterThan(1);
});

test("lower-tier clubs choose first while preserving the order within a tier", () => {
	expect(
		orderMinimumContractUpgradeTeams([
			{ tid: 1, tier: 1 },
			{ tid: 2, tier: 3 },
			{ tid: 3, tier: 2 },
			{ tid: 4, tier: 3 },
		]),
	).toEqual([
		{ tid: 2, tier: 3 },
		{ tid: 4, tier: 3 },
		{ tid: 3, tier: 2 },
		{ tid: 1, tier: 1 },
	]);
});
