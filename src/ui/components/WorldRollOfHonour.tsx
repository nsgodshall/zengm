import { DataTable } from "./DataTable/index.tsx";
import { CountBadge } from "./PlayerNameLabels.tsx";
import { TeamLogoInline } from "./TeamLogoInline.tsx";
import { helpers } from "../util/helpers.ts";
import type { View } from "../../common/types.ts";

type Country = NonNullable<View<"historyAll">["worldRollOfHonour"]>[number];
type Club = NonNullable<Country["seasons"][number]["runnerUp"]>;

const clubLink = (
	t: Pick<Club, "abbrev" | "tid" | "region">,
	season: number,
) => (
	<a href={helpers.leagueUrl(["roster", `${t.abbrev}_${t.tid}`, season])}>
		{t.region}
	</a>
);

const clubCell = (t: Club | undefined, season: number, userTid: number) => {
	if (!t) {
		return null;
	}
	return {
		classNames: t.tid === userTid ? "table-info py-1" : "py-1",
		value: (
			<div className="d-flex align-items-center">
				<TeamLogoInline imgURL={t.imgURL} imgURLSmall={t.imgURLSmall} />
				<div className="ms-1 me-auto">{clubLink(t, season)}</div>
				<CountBadge count={t.count} />
			</div>
		),
		sortValue: `${t.region} ${t.name} ${season}`,
	};
};

const clubList = (
	clubs: (Pick<Club, "abbrev" | "tid" | "region"> & { viaPlayoff?: boolean })[],
	season: number,
) =>
	clubs.length === 0
		? null
		: {
				value: (
					<>
						{clubs.map((t, i) => (
							<span key={t.tid}>
								{i > 0 ? ", " : null}
								{clubLink(t, season)}
								{t.viaPlayoff ? " (P)" : null}
							</span>
						))}
					</>
				),
				sortValue: clubs.map((t) => t.region).join(", "),
			};

// International Soccer Zen GM mod (storytelling): each Country's champions on
// every tier, top-tier runners-up, and who went up to and down from its top
// tier, season by season, for a World's League History page
export const WorldRollOfHonour = ({
	countries,
	userTid,
}: {
	countries: NonNullable<View<"historyAll">["worldRollOfHonour"]>;
	userTid: number;
}) => {
	return (
		<>
			{countries.map((country) => {
				const topDivision = country.divisions[0];
				const cols = [
					{ title: "Season", sortType: "number" as const },
					...country.divisions.map((division) => ({
						title: division.name,
						desc: `${division.name} champion`,
						sortType: "name" as const,
					})),
					{
						title: "Runner Up",
						desc: `${topDivision?.name} runner up`,
						sortType: "name" as const,
					},
					{
						title: "Promoted",
						desc: `Promoted to the ${topDivision?.name}`,
						sortType: "name" as const,
					},
					{
						title: "Relegated",
						desc: `Relegated from the ${topDivision?.name}`,
						sortType: "name" as const,
					},
				];

				const rows = country.seasons.map((row) => ({
					key: row.season,
					data: [
						<a href={helpers.leagueUrl(["history", row.season])}>
							{row.season}
						</a>,
						...row.champions.map((champion) =>
							clubCell(champion, row.season, userTid),
						),
						clubCell(row.runnerUp, row.season, userTid),
						clubList(row.promotedToTop, row.season),
						clubList(row.relegatedFromTop, row.season),
					],
				}));

				return (
					<div key={country.countryId} className="mb-4">
						<h2>{country.name}</h2>
						{rows.length === 0 ? (
							<p>No seasons have finished yet.</p>
						) : (
							<DataTable
								cols={cols}
								defaultSort={[0, "desc"]}
								defaultStickyCols={1}
								name={`HistoryAllWorld${country.countryId}`}
								pagination
								rows={rows}
							/>
						)}
					</div>
				);
			})}
		</>
	);
};
