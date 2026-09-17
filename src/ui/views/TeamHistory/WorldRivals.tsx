import { TeamLogoInline } from "../../components/TeamLogoInline.tsx";
import type { View } from "../../../common/types.ts";
import { helpers } from "../../util/helpers.ts";

type Rivals = NonNullable<View<"teamHistory">["worldRivals"]>;

const seasonList = (label: string, seasons: number[]) =>
	seasons.length > 0 ? `${label} ${seasons.join(", ")}` : undefined;

// International Soccer Zen GM mod (storytelling): a World club's rivals, from
// sharing a town and a history (see competition/rivalries.ts)
export const WorldRivals = ({
	abbrev,
	rivals,
	tid,
}: {
	abbrev: string;
	rivals: Rivals;
	tid: number;
}) => {
	if (rivals.length === 0) {
		return <p>No rivals yet.</p>;
	}

	return (
		<ul className="list-unstyled mb-3">
			{rivals.map((rival) => {
				const why = [
					rival.derbyTown ? `the ${rival.derbyTown} derby` : undefined,
					seasonList("first and second in", rival.titleRaces),
					seasonList("promoted together in", rival.wentUpTogether),
					seasonList("relegated together in", rival.wentDownTogether),
					seasonList("met in the promotion playoffs in", rival.playoffMeetings),
				].filter((text) => text !== undefined);
				return (
					<li key={rival.tid} className="d-flex align-items-start mb-2">
						<TeamLogoInline
							imgURL={rival.imgURL}
							imgURLSmall={rival.imgURLSmall}
						/>
						<div className="ms-2">
							<a
								href={helpers.leagueUrl([
									"team_history",
									`${rival.abbrev}_${rival.tid}`,
								])}
							>
								{rival.region} {rival.name}
							</a>
							<div className="text-body-secondary">
								{helpers.upperCaseFirstLetter(why.join("; "))}
								{" · "}
								<a
									href={helpers.leagueUrl([
										"head2head",
										`${abbrev}_${tid}`,
										"all",
									])}
								>
									All-time {helpers.formatRecord(rival.record)}
								</a>
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
};
