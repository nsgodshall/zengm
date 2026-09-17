import { CountryFlag } from "../components/CountryFlag.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import { TeamLogoInline } from "../components/TeamLogoInline.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";
import type { View } from "../../common/types.ts";

type Country = View<"worldRecords">["countries"][number];
type Club = Country["allTimeTable"][number];

const clubLink = (club: Pick<Club, "abbrev" | "tid" | "region" | "name">) => (
	<a href={helpers.leagueUrl(["team_history", `${club.abbrev}_${club.tid}`])}>
		{club.region} {club.name}
	</a>
);

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): each Country's records and all-time top-tier table
const WorldRecords = ({ countries }: View<"worldRecords">) => {
	useTitleBar({ title: "Records" });
	const { userTid } = useLocal(["userTid"]);

	const cols = [
		{ title: "Club", sortType: "string" as const },
		{
			title: "Seasons",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
		{
			title: "W",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
		{
			title: "L",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
		{
			title: "T",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
		{
			title: "Pts",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
		{
			title: "Titles",
			sortSequence: ["desc", "asc"] as const,
			sortType: "number" as const,
		},
	];

	return (
		<>
			<MoreLinks type="league" page="world_records" />

			{countries.map((country) => (
				<div key={country.countryId} className="mb-4">
					<h2>
						<CountryFlag className="me-2" country={country.name} />
						{country.name}
					</h2>
					{country.records.length === 0 ? (
						<p>No season has finished yet.</p>
					) : (
						<div className="row">
							<div className="col-lg-5 mb-3">
								<h3>Records</h3>
								<ul className="list-unstyled mb-3">
									{country.records.map((record) => (
										<li key={record.label}>
											{record.label}:{" "}
											<span className="fw-bold">{record.holder.value}</span>
											{record.holder.text
												? ` (${record.holder.text})`
												: null}{" "}
											{clubLink(record.holder)}
											{record.holder.opponent ? (
												<> against {clubLink(record.holder.opponent)}</>
											) : null}
											{record.holder.season !== undefined
												? `, ${record.holder.season}`
												: `, ${record.holder.from}–${record.holder.to}`}
										</li>
									))}
								</ul>
								{country.mostTitles.length > 0 ? (
									<>
										<h3>Most titles</h3>
										<ul className="list-unstyled mb-0">
											{country.mostTitles.map((row) => (
												<li key={row.tid}>
													{row.value} {clubLink(row)}
												</li>
											))}
										</ul>
									</>
								) : null}
							</div>
							<div className="col-lg-7">
								<h3>All-time {country.topDivisionName}</h3>
								<DataTable
									className="align-middle"
									cols={cols}
									defaultSort={[5, "desc"]}
									defaultStickyCols={1}
									name={`WorldRecords${country.countryId}`}
									nonfluid
									pagination={country.allTimeTable.length > 20}
									rows={country.allTimeTable.map((row) => ({
										key: row.tid,
										data: [
											{
												value: (
													<div className="d-flex align-items-center">
														<TeamLogoInline
															imgURL={row.imgURL}
															imgURLSmall={row.imgURLSmall}
														/>
														<div className="ms-1">{clubLink(row)}</div>
													</div>
												),
												sortValue: `${row.region} ${row.name}`,
											},
											row.seasons,
											row.won,
											row.lost,
											row.tied,
											row.points,
											row.titles === 0 ? undefined : row.titles,
										],
										classNames: {
											"table-info": row.tid === userTid,
										},
									}))}
								/>
							</div>
						</div>
					)}
				</div>
			))}
		</>
	);
};

export default WorldRecords;
