import { useState } from "react";
import { ActionButton } from "./ActionButton.tsx";
import { showNotification } from "../util/showNotification.ts";
import { toWorker } from "../util/toWorker.ts";

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 7): a Country's season review, written by the user's own language model from
// the facts the season saved (see competition/writeSeasonReview.ts). Nothing is
// written without the user asking, and once written it's kept, so a season
// reads the same every time it's opened.

export const SeasonReview = ({
	canWrite,
	countryId,
	review,
	season,
}: {
	canWrite: boolean;
	countryId: number;
	review: string | undefined;
	season: number;
}) => {
	const [text, setText] = useState(review);
	const [writing, setWriting] = useState(false);

	if (text === undefined && !canWrite) {
		return null;
	}

	const write = async () => {
		setWriting(true);
		try {
			setText(
				await toWorker("main", "writeSeasonReview", { season, countryId }),
			);
		} catch (error) {
			showNotification({
				type: "error",
				text: (error as Error).message,
				// The user asked for this and needs to read why it didn't happen
				persistent: true,
			});
		}
		setWriting(false);
	};

	const rewrite = async () => {
		await toWorker("main", "deleteSeasonReview", { season, countryId });
		setText(undefined);
		await write();
	};

	return (
		<div className="mb-3">
			{text === undefined ? (
				<ActionButton
					className="btn-light-bordered btn-sm"
					onClick={write}
					processing={writing}
					processingText="Writing"
				>
					Write the season review
				</ActionButton>
			) : (
				<>
					{text.split(/\n\s*\n/).map((paragraph, i) => (
						<p key={i}>{paragraph}</p>
					))}
					{canWrite ? (
						<ActionButton
							className="btn-light-bordered btn-sm"
							onClick={rewrite}
							processing={writing}
							processingText="Writing"
						>
							Write it again
						</ActionButton>
					) : null}
				</>
			)}
		</div>
	);
};
