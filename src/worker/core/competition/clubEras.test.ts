import { describe, expect, test } from "vitest";
import type { WorldHistoryEntry } from "../../../common/types.ts";
import { describeClubEra, getClubEras } from "./clubEras.ts";

const entry = (
	season: number,
	tier: number,
	position: number,
	extra: Partial<WorldHistoryEntry> = {},
): WorldHistoryEntry => ({
	season,
	divisionId: tier,
	tier,
	position,
	numClubs: 20,
	pyramidPosition: (tier - 1) * 20 + position,
	points: 50,
	...extra,
});

describe("getClubEras", () => {
	test("breaks a club's history into its spells in each tier", () => {
		const eras = getClubEras([
			entry(2026, 1, 8),
			entry(2027, 1, 18, { moved: "relegated" }),
			entry(2028, 2, 6),
			entry(2029, 2, 1, { champion: true, moved: "promoted" }),
			entry(2030, 1, 11),
		]);

		expect(eras.map((era) => [era.from, era.to, era.tier])).toEqual([
			[2026, 2027, 1],
			[2028, 2029, 2],
			[2030, 2030, 1],
		]);
		expect(eras[0]!.ended).toBe("relegated");
		expect(eras[1]!.ended).toBe("promoted");
		expect(eras[1]!.titles).toBe(1);
		expect(eras[2]!.ended).toBeUndefined();
	});

	test("remembers the best and worst finishes of an era", () => {
		const [era] = getClubEras([
			entry(2026, 1, 8),
			entry(2027, 1, 3),
			entry(2028, 1, 14),
		]);

		expect(era!.best).toEqual({ position: 3, season: 2027 });
		expect(era!.worst).toEqual({ position: 14, season: 2028 });
		expect(era!.seasons).toBe(3);
	});

	test("starts a new era after seasons the club didn't play", () => {
		const eras = getClubEras([entry(2026, 1, 4), entry(2030, 1, 6)]);

		expect(eras).toHaveLength(2);
	});

	test("ends the latest era when the club has just gone down", () => {
		const eras = getClubEras([
			entry(2026, 1, 8),
			entry(2027, 1, 19, { moved: "relegated" }),
		]);

		expect(eras.at(-1)!.ended).toBe("relegated");
	});

	test("has nothing to say about a club with no history", () => {
		expect(getClubEras([])).toEqual([]);
	});
});

describe("describeClubEra", () => {
	const describe1 = (history: WorldHistoryEntry[]) =>
		describeClubEra({
			era: getClubEras(history).at(-1)!,
			divisionName: "First Division",
		});

	test("counts the titles of a winning era", () => {
		const { span, text } = describe1([
			entry(2026, 1, 1, { champion: true }),
			entry(2027, 1, 1, { champion: true }),
		]);

		expect(span).toBe("2026–2027");
		expect(text).toBe("2 seasons in the First Division, 2 titles");
	});

	test("falls back to the best finish, and says how the era ended", () => {
		const { span, text } = describe1([
			entry(2026, 2, 5),
			entry(2027, 2, 2, { moved: "promoted" }),
		]);

		expect(span).toBe("2026–2027");
		expect(text).toBe("2 seasons in the First Division, best 2nd, went up");
	});

	test("reads right for a single season", () => {
		const { span, text } = describe1([entry(2026, 1, 12)]);

		expect(span).toBe("2026");
		expect(text).toBe("1 season in the First Division, best 12th");
	});
});
