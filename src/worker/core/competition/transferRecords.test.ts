import { describe, expect, test } from "vitest";
import {
	describeTransfer,
	getBrokenTransferRecords,
	updateClubRecordSigning,
	updateTransferRecords,
} from "./transferRecords.ts";

const transfer = (fee: number, pid = 1) => ({
	fee,
	pid,
	name: `Player ${pid}`,
	buyerTid: 0,
	sellerTid: 1,
	season: 2030,
});

describe("transfer records", () => {
	test("the first fees set records without breaking any", () => {
		expect(
			getBrokenTransferRecords({
				fee: 50000,
				countryId: 0,
				records: undefined,
				clubRecord: undefined,
			}),
		).toEqual({ world: false, country: false, club: false });

		const records = updateTransferRecords({
			records: undefined,
			countryId: 0,
			transfer: transfer(50000),
		});
		expect(records).toEqual({
			world: transfer(50000),
			byCountryId: { 0: transfer(50000) },
		});
	});

	test("a bigger fee breaks the World's, a Country's, and a club's records separately", () => {
		let records = updateTransferRecords({
			records: undefined,
			countryId: 0,
			transfer: transfer(80000, 1),
		});
		records = updateTransferRecords({
			records,
			countryId: 1,
			transfer: transfer(30000, 2),
		});

		expect(
			getBrokenTransferRecords({
				fee: 40000,
				countryId: 1,
				records,
				clubRecord: transfer(45000),
			}),
		).toEqual({ world: false, country: true, club: false });
		expect(
			getBrokenTransferRecords({
				fee: 90000,
				countryId: 1,
				records,
				clubRecord: transfer(45000),
			}),
		).toEqual({ world: true, country: true, club: true });
		expect(
			getBrokenTransferRecords({
				fee: 0,
				countryId: 1,
				records,
				clubRecord: transfer(45000),
			}),
		).toEqual({ world: false, country: false, club: false });

		records = updateTransferRecords({
			records,
			countryId: 1,
			transfer: transfer(40000, 3),
		});
		expect(records.world?.pid).toBe(1);
		expect(records.byCountryId[1]?.pid).toBe(3);
		expect(
			updateClubRecordSigning(transfer(45000, 4), transfer(40000, 3))?.pid,
		).toBe(4);
		expect(updateClubRecordSigning(undefined, transfer(40000, 3))?.pid).toBe(3);
	});

	test("news names only the biggest record broken, and a player's return to his first club", () => {
		expect(
			describeTransfer({
				broken: { world: true, country: true, club: true },
				countryAdjective: "Spanish",
				returnsToFirstClub: false,
			}),
		).toEqual({ sentences: ["It's a World record fee."], scoreBonus: 15 });
		expect(
			describeTransfer({
				broken: { world: false, country: true, club: true },
				countryAdjective: "Spanish",
				returnsToFirstClub: true,
			}),
		).toEqual({
			sentences: [
				"It's a Spanish record fee.",
				"He returns to the club where he started.",
			],
			scoreBonus: 15,
		});
		expect(
			describeTransfer({
				broken: { world: false, country: true, club: false },
				countryAdjective: undefined,
				returnsToFirstClub: false,
			}),
		).toEqual({ sentences: [], scoreBonus: 0 });
	});
});
