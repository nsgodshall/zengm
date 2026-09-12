import { expect, test } from "vitest";
import resolvePromotionRelegation, {
	flattenPromotionRelegationMoves,
	validatePromotionRelegationLink,
} from "./resolvePromotionRelegation.ts";
import type { DivisionTableRow } from "./computeDivisionTable.ts";
import type { PromotionRelegationLink } from "../../../common/types.ts";

const makeTable = (tids: number[]): DivisionTableRow[] =>
	tids.map((tid, i) => ({
		tid,
		won: 0,
		lost: 0,
		tied: 0,
		pointDiff: 0,
		scored: 0,
		points: 0,
		rank: i + 1,
	}));

const link: PromotionRelegationLink = {
	id: 1,
	countryId: 1,
	upperDivisionId: 100,
	lowerDivisionId: 200,
	numAutoPromoted: 2,
	numAutoRelegated: 2,
	numPromotionPlayoffTeams: 0,
	numPromotionPlayoffSpots: 0,
};

// 1 automatic + 1 playoff spot up, 2 down
const linkWithPlayoff: PromotionRelegationLink = {
	...link,
	numAutoPromoted: 1,
	numPromotionPlayoffTeams: 2,
	numPromotionPlayoffSpots: 1,
};

test("pure table-based promotion/relegation, no playoff", () => {
	const tables = {
		100: makeTable([1, 2, 3, 4]), // upper division, ranks 1-4
		200: makeTable([5, 6, 7, 8]), // lower division, ranks 1-4
	};

	const [result] = resolvePromotionRelegation([link], tables);

	expect(result!.autoPromoted).toEqual([5, 6]); // top 2 of lower division
	expect(result!.autoRelegated).toEqual([3, 4]); // bottom 2 of upper division
	expect(result!.promotionPlayoffParticipants).toEqual([]);
});

test("promotion playoff participants are named but not decided here", () => {
	const tables = {
		100: makeTable([1, 2, 3, 4, 5, 6]),
		200: makeTable([10, 11, 12, 13, 14, 15]),
	};

	const [result] = resolvePromotionRelegation(
		[{ ...linkWithPlayoff, numPromotionPlayoffTeams: 4 }],
		tables,
	);

	expect(result!.autoPromoted).toEqual([10]);
	expect(result!.promotionPlayoffParticipants).toEqual([11, 12, 13, 14]);
	expect(result!.numPromotionPlayoffSpots).toBe(1);
});

test("a link with nobody moving is valid", () => {
	const [result] = resolvePromotionRelegation(
		[{ ...link, numAutoPromoted: 0, numAutoRelegated: 0 }],
		{ 100: makeTable([1, 2]), 200: makeTable([3, 4]) },
	);

	expect(result!.autoPromoted).toEqual([]);
	expect(result!.autoRelegated).toEqual([]);
	expect(flattenPromotionRelegationMoves([result!])).toEqual([]);
});

test("throws if a table is missing for a link", () => {
	expect(() => resolvePromotionRelegation([link], {})).toThrow(/Missing table/);
});

test("validatePromotionRelegationLink rejects links that would change Division sizes", () => {
	expect(() =>
		validatePromotionRelegationLink({ ...link, numAutoRelegated: 3 }),
	).toThrow(/unbalanced/);

	// Playoff spots count toward promotion
	expect(() =>
		validatePromotionRelegationLink({
			...linkWithPlayoff,
			numAutoRelegated: 1,
		}),
	).toThrow(/unbalanced/);
});

test("validatePromotionRelegationLink rejects malformed links", () => {
	expect(() =>
		validatePromotionRelegationLink({ ...link, numAutoPromoted: -1 }),
	).toThrow(/non-negative integer/);
	expect(() =>
		validatePromotionRelegationLink({ ...link, numAutoPromoted: 1.5 }),
	).toThrow(/non-negative integer/);
	expect(() =>
		validatePromotionRelegationLink({ ...link, lowerDivisionId: 100 }),
	).toThrow(/both 100/);
	expect(() =>
		validatePromotionRelegationLink({
			...linkWithPlayoff,
			numPromotionPlayoffTeams: 0,
		}),
	).toThrow(/only 0 playoff team/);
	expect(() =>
		validatePromotionRelegationLink({
			...link,
			numPromotionPlayoffTeams: 2,
		}),
	).toThrow(/no promotion playoff spots/);

	expect(() => validatePromotionRelegationLink(link)).not.toThrow();
	expect(() => validatePromotionRelegationLink(linkWithPlayoff)).not.toThrow();
});

test("throws if the upper Division is smaller than the number relegated", () => {
	expect(() =>
		resolvePromotionRelegation([link], {
			100: makeTable([1]),
			200: makeTable([5, 6, 7, 8]),
		}),
	).toThrow(/upper Division 100 has 1 club/);
});

test("throws if the lower Division can't supply auto-promoted plus playoff clubs", () => {
	expect(() =>
		resolvePromotionRelegation([linkWithPlayoff], {
			100: makeTable([1, 2, 3, 4]),
			200: makeTable([5, 6]),
		}),
	).toThrow(/lower Division 200 has 2 club/);
});

test("3-tier pyramid: the middle Division sends clubs both ways", () => {
	const lowerLink: PromotionRelegationLink = {
		...link,
		id: 2,
		upperDivisionId: 200,
		lowerDivisionId: 300,
	};

	const results = resolvePromotionRelegation([link, lowerLink], {
		100: makeTable([1, 2, 3, 4]),
		200: makeTable([5, 6, 7, 8]),
		300: makeTable([9, 10, 11, 12]),
	});
	const moves = flattenPromotionRelegationMoves(results);

	expect(moves).toEqual([
		{ tid: 5, fromDivisionId: 200, toDivisionId: 100 },
		{ tid: 6, fromDivisionId: 200, toDivisionId: 100 },
		{ tid: 3, fromDivisionId: 100, toDivisionId: 200 },
		{ tid: 4, fromDivisionId: 100, toDivisionId: 200 },
		{ tid: 9, fromDivisionId: 300, toDivisionId: 200 },
		{ tid: 10, fromDivisionId: 300, toDivisionId: 200 },
		{ tid: 7, fromDivisionId: 200, toDivisionId: 300 },
		{ tid: 8, fromDivisionId: 200, toDivisionId: 300 },
	]);
});

test("3-tier pyramid: throws if the middle Division is too small to send clubs both ways", () => {
	const lowerLink: PromotionRelegationLink = {
		...link,
		id: 2,
		upperDivisionId: 200,
		lowerDivisionId: 300,
	};

	// Division 200 has 3 clubs, but 2 go up and 2 go down, so club 6 is in both
	expect(() =>
		resolvePromotionRelegation([link, lowerLink], {
			100: makeTable([1, 2, 3, 4]),
			200: makeTable([5, 6, 7]),
			300: makeTable([9, 10, 11, 12]),
		}),
	).toThrow(/Club 6 is picked more than once/);
});

test("throws if the same club appears in two tables", () => {
	expect(() =>
		resolvePromotionRelegation([link], {
			100: makeTable([1, 2, 3, 4]),
			200: makeTable([4, 6, 7, 8]),
		}),
	).toThrow(/Club 4 is picked more than once/);
});

test("flattenPromotionRelegationMoves combines auto moves and playoff winners", () => {
	const results = resolvePromotionRelegation([linkWithPlayoff], {
		100: makeTable([1, 2, 3, 4]),
		200: makeTable([5, 6, 7, 8]),
	});

	const moves = flattenPromotionRelegationMoves(results, { 1: [7] });

	expect(moves).toEqual([
		{ tid: 5, fromDivisionId: 200, toDivisionId: 100 },
		{ tid: 3, fromDivisionId: 100, toDivisionId: 200 },
		{ tid: 4, fromDivisionId: 100, toDivisionId: 200 },
		{ tid: 7, fromDivisionId: 200, toDivisionId: 100 },
	]);

	// Balanced: as many clubs go up as come down
	const up = moves.filter((move) => move.toDivisionId === 100).length;
	const down = moves.filter((move) => move.toDivisionId === 200).length;
	expect(up).toBe(down);
});

test("flattenPromotionRelegationMoves rejects playoff winners that would unbalance the move", () => {
	const results = resolvePromotionRelegation([linkWithPlayoff], {
		100: makeTable([1, 2, 3, 4]),
		200: makeTable([5, 6, 7, 8]),
	});

	// Playoff not resolved yet
	expect(() => flattenPromotionRelegationMoves(results)).toThrow(
		/expected 1 promotion playoff winner\(s\), got 0/,
	);

	// Too many winners
	expect(() => flattenPromotionRelegationMoves(results, { 1: [6, 7] })).toThrow(
		/expected 1 promotion playoff winner\(s\), got 2/,
	);

	// Winner wasn't in the playoff (8 finished below the playoff places)
	expect(() => flattenPromotionRelegationMoves(results, { 1: [8] })).toThrow(
		/club 8 won the promotion playoff but wasn't one of its participants/,
	);

	// Winners for a link that has no playoff
	const noPlayoffResults = resolvePromotionRelegation([link], {
		100: makeTable([1, 2, 3, 4]),
		200: makeTable([5, 6, 7, 8]),
	});
	expect(() =>
		flattenPromotionRelegationMoves(noPlayoffResults, { 1: [7] }),
	).toThrow(/expected 0 promotion playoff winner\(s\), got 1/);

	// Winners for a link that doesn't exist
	expect(() =>
		flattenPromotionRelegationMoves(results, { 1: [7], 99: [1] }),
	).toThrow(/link 99/);
});
