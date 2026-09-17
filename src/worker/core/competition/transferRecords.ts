import type {
	GameAttributesLeague,
	WorldTransferRecord,
} from "../../../common/types.ts";
import type { StoryContext } from "./storyContext.ts";

// International Soccer Zen GM mod (storytelling): record transfer fees, for
// what a transfer means in its news (see STORY_TELLING_PLAN.md, Phase 3)

export type WorldTransferRecords = NonNullable<
	GameAttributesLeague["worldTransferRecords"]
>;

export const TRANSFER_RECORD_SCORE_BONUS = {
	world: 15,
	country: 10,
	club: 5,
	return: 5,
};

/**
 * Which records a fee breaks: the World's, the buying club's Country's, and the
 * buying club's own. A club's first fee is only its record once it has paid
 * one before, so the first purchases in a new World aren't all "records".
 */
export const getBrokenTransferRecords = ({
	fee,
	countryId,
	records,
	clubRecord,
}: {
	fee: number;
	countryId: number | undefined;
	records: WorldTransferRecords | undefined;
	clubRecord: WorldTransferRecord | undefined;
}) => {
	if (fee <= 0) {
		return { world: false, country: false, club: false };
	}
	const countryRecord =
		countryId === undefined ? undefined : records?.byCountryId[countryId];
	return {
		world: records?.world !== undefined && fee > records.world.fee,
		country: countryRecord !== undefined && fee > countryRecord.fee,
		club: clubRecord !== undefined && fee > clubRecord.fee,
	};
};

/** The records after a transfer, whether or not it broke any */
export const updateTransferRecords = ({
	records,
	countryId,
	transfer,
}: {
	records: WorldTransferRecords | undefined;
	countryId: number | undefined;
	transfer: WorldTransferRecord;
}): WorldTransferRecords => {
	const next: WorldTransferRecords = {
		...(records?.world ? { world: records.world } : {}),
		byCountryId: { ...records?.byCountryId },
	};
	if (transfer.fee <= 0) {
		return next;
	}
	if (!next.world || transfer.fee > next.world.fee) {
		next.world = transfer;
	}
	if (countryId !== undefined) {
		const countryRecord = next.byCountryId[countryId];
		if (!countryRecord || transfer.fee > countryRecord.fee) {
			next.byCountryId[countryId] = transfer;
		}
	}
	return next;
};

/** A club's record signing after a transfer */
export const updateClubRecordSigning = (
	clubRecord: WorldTransferRecord | undefined,
	transfer: WorldTransferRecord,
) =>
	transfer.fee > 0 && (!clubRecord || transfer.fee > clubRecord.fee)
		? transfer
		: clubRecord;

/**
 * What a transfer means: records broken (only the biggest is mentioned), and a
 * player going back to the club he started at
 */
export const describeTransfer = ({
	broken,
	countryAdjective,
	returnsToFirstClub,
}: {
	broken: ReturnType<typeof getBrokenTransferRecords>;
	countryAdjective: string | undefined;
	returnsToFirstClub: boolean;
}): StoryContext => {
	const sentences: string[] = [];
	let scoreBonus = 0;
	if (broken.world) {
		sentences.push("It's a World record fee.");
		scoreBonus = TRANSFER_RECORD_SCORE_BONUS.world;
	} else if (broken.country && countryAdjective) {
		sentences.push(`It's a ${countryAdjective} record fee.`);
		scoreBonus = TRANSFER_RECORD_SCORE_BONUS.country;
	} else if (broken.club) {
		sentences.push("It's a club record fee.");
		scoreBonus = TRANSFER_RECORD_SCORE_BONUS.club;
	}
	if (returnsToFirstClub) {
		sentences.push("He returns to the club where he started.");
		scoreBonus += TRANSFER_RECORD_SCORE_BONUS.return;
	}
	return { sentences, scoreBonus };
};
