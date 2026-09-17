import type { View } from "../../../common/types.ts";
import { helpers } from "../../util/helpers.ts";

type Legends = NonNullable<View<"teamHistory">["worldLegends"]>;
type Legend = Legends["mostAppearances"][number];

const LegendList = ({
	legends,
	title,
	value,
}: {
	legends: Legend[];
	title: string;
	value: (legend: Legend) => string;
}) => {
	if (legends.length === 0) {
		return null;
	}

	return (
		<div className="col-sm-6 mb-3">
			<h3>{title}</h3>
			<ol className="list-unstyled mb-0">
				{legends.map((legend) => (
					<li key={legend.pid}>
						<a href={helpers.leagueUrl(["player", legend.pid])}>
							{legend.name}
						</a>{" "}
						<span className="text-body-secondary">
							{value(legend)}, {legend.firstSeason}
							{legend.lastSeason === legend.firstSeason
								? ""
								: `–${legend.lastSeason}`}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
};

// International Soccer Zen GM mod (storytelling): a World club's legends
export const WorldLegends = ({ legends }: { legends: Legends }) => {
	const games = (legend: Legend) =>
		helpers.plural(`${legend.gp} game`, legend.gp);
	return (
		<div className="row">
			<LegendList
				legends={legends.mostAppearances}
				title="Most games"
				value={games}
			/>
			<LegendList
				legends={legends.topScorers}
				title="Top scorers"
				value={(legend) => helpers.numberWithCommas(legend.value)}
			/>
			<LegendList
				legends={legends.oneClubPlayers}
				title="One-club players"
				value={games}
			/>
			<LegendList
				legends={legends.academyGraduates}
				title="Academy graduates"
				value={games}
			/>
		</div>
	);
};
