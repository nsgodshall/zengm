// International Soccer Zen GM mod (Epic 6): a World club's board objective,
// and how it's going
export const BoardObjective = ({
	boardObjective,
}: {
	boardObjective: {
		text: string;
		fans?: string;
		targetPosition: number;
		position: number | undefined;
		seasonOver: boolean;
	};
}) => {
	const { text, fans, targetPosition, position, seasonOver } = boardObjective;

	let status;
	if (position !== undefined) {
		const met = position <= targetPosition;
		status = (
			<span className={met ? "text-success" : "text-danger"}>
				{seasonOver ? (met ? "met" : "missed") : met ? "on track" : "behind"}
			</span>
		);
	}

	return (
		<>
			<span title="What the board expects this season. Meeting it keeps the owner happy, and missing it badly can get you fired.">
				Board objective
			</span>
			: {text}
			{status ? <> ({status})</> : null}
			{/* International Soccer Zen GM mod (storytelling, Phase 5) */}
			{fans ? <div className="text-body-secondary small">{fans}</div> : null}
		</>
	);
};
