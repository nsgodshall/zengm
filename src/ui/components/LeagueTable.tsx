import clsx from "clsx";
import { type CSSProperties, Fragment, useState } from "react";
import type { View } from "../../common/types.ts";
import { bySport } from "../../common/sportFunctions.ts";
import useClickable from "../hooks/useClickable.tsx";
import { helpers } from "../util/helpers.ts";
import { CountryFlag } from "./CountryFlag.tsx";
import { ResponsiveTableWrapper } from "./ResponsiveTableWrapper.tsx";
import { TeamLogoInline } from "./TeamLogoInline.tsx";

// International Soccer Zen GM mod (Epic 6): soccer-style league tables for a
// World, from competition/worldTables.ts

type WorldTables = NonNullable<View<"standings">["worldTables"]>;
type DivisionTable = WorldTables["divisions"][number];
type TableRow = DivisionTable["rows"][number];
type TableZone = NonNullable<TableRow["zone"]>;

const ZONES: Record<TableZone, { color: string; text: string }> = {
	promotion: { color: "var(--bs-success)", text: "Promotion" },
	promotionPlayoff: { color: "var(--bs-warning)", text: "Promotion playoff" },
	relegation: { color: "var(--bs-danger)", text: "Relegation" },
};

// Every position cell gets the same left border, so ranks line up whether or
// not a position is in a zone
const zoneStyle = (zone: TableRow["zone"]): CSSProperties => ({
	borderLeft: `4px solid ${zone ? ZONES[zone].color : "transparent"}`,
});

const FORM_CLASSES = {
	W: "bg-success",
	D: "bg-secondary",
	L: "bg-danger",
} as const;

const formBadgeStyle = { width: "1.6em" };

const Form = ({ form }: { form: TableRow["form"] }) => (
	<div className="d-flex gap-1">
		{form.map((result, i) => (
			<span
				key={i}
				className={clsx("badge", FORM_CLASSES[result])}
				style={formBadgeStyle}
			>
				{result}
			</span>
		))}
	</div>
);

// Epic 8: what a club's season actually led to, once it's over
const RESULTS = {
	promoted: { className: "text-success", symbol: "▲", title: "Promoted" },
	promotedViaPlayoff: {
		className: "text-success",
		symbol: "▲",
		title: "Promoted through the promotion playoff",
	},
	relegated: { className: "text-danger", symbol: "▼", title: "Relegated" },
} as const;

const Club = ({
	champion,
	includeName,
	row,
	season,
}: {
	champion: boolean;
	includeName: boolean;
	row: TableRow;
	season?: number;
}) => (
	<div className="d-flex align-items-center">
		<TeamLogoInline
			imgURL={row.imgURL}
			imgURLSmall={row.imgURLSmall}
			className="me-1 flex-shrink-0"
		/>
		<div className="text-truncate">
			<a
				href={helpers.leagueUrl(["roster", `${row.abbrev}_${row.tid}`, season])}
			>
				<span className="d-none d-sm-inline">
					{row.region}
					{includeName ? ` ${row.name}` : null}
				</span>
				<span className="d-sm-none">{row.abbrev}</span>
			</a>
			{champion ? (
				<span className="fw-bold" title="Champion">
					{" "}
					(C)
				</span>
			) : null}
			{row.result ? (
				<span
					className={RESULTS[row.result].className}
					title={RESULTS[row.result].title}
				>
					{" "}
					{RESULTS[row.result].symbol}
					{row.result === "promotedViaPlayoff" ? " (P)" : null}
				</span>
			) : null}
		</div>
	</div>
);

const diff = (pointDiff: number) =>
	pointDiff > 0 ? `+${pointDiff}` : String(pointDiff);

const scoredCols = bySport({
	baseball: {
		for: "RS",
		against: "RA",
		forTitle: "Runs scored",
		againstTitle: "Runs allowed",
	},
	hockey: {
		for: "GF",
		against: "GA",
		forTitle: "Goals for",
		againstTitle: "Goals against",
	},
	default: {
		for: "PF",
		against: "PA",
		forTitle: "Points scored",
		againstTitle: "Points allowed",
	},
});

const Row = ({
	row,
	season,
	seasonOver,
	showDraws,
	userTid,
}: {
	row: TableRow;
	season: number;
	seasonOver: boolean;
	showDraws: boolean;
	userTid: number;
}) => {
	const { clicked, toggleClicked } = useClickable();

	return (
		<tr
			className={clsx({
				"table-info": row.tid === userTid,
				"table-warning": clicked,
			})}
			onClick={toggleClicked}
		>
			<td className="text-end" style={zoneStyle(row.zone)}>
				{row.rank}
			</td>
			<td>
				<Club
					champion={seasonOver && row.rank === 1}
					includeName
					row={row}
					season={season}
				/>
			</td>
			<td>{row.played}</td>
			<td>{row.won}</td>
			{showDraws ? <td>{row.tied}</td> : null}
			<td>{row.lost}</td>
			<td>{row.scored}</td>
			<td>{row.conceded}</td>
			<td>{diff(row.pointDiff)}</td>
			<td className="fw-bold">
				{row.points}
				{/* International Soccer Zen GM mod (storytelling): points taken off a
				club in administration */}
				{row.pointsDeduction ? (
					<span
						className="text-danger ms-1"
						title={`${row.pointsDeduction} points deducted`}
					>
						(-{row.pointsDeduction})
					</span>
				) : null}
			</td>
			<td>
				<Form form={row.form} />
			</td>
		</tr>
	);
};

const DivisionTableFull = ({
	division,
	season,
	seasonOver,
	showDraws,
	userTid,
}: {
	division: DivisionTable;
	season: number;
	seasonOver: boolean;
	showDraws: boolean;
	userTid: number;
}) => (
	<ResponsiveTableWrapper>
		<table className="table table-striped table-borderless table-sm table-hover sticky-x">
			<thead>
				<tr>
					<th className="text-end" title="Position">
						#
					</th>
					<th className="standings-name">Club</th>
					<th title="Played">P</th>
					<th title="Won">W</th>
					{showDraws ? <th title="Drawn">D</th> : null}
					<th title="Lost">L</th>
					<th title={scoredCols.forTitle}>{scoredCols.for}</th>
					<th title={scoredCols.againstTitle}>{scoredCols.against}</th>
					<th title="Difference">Diff</th>
					<th title="Points">Pts</th>
					<th title="Last 5 games, oldest first">Form</th>
				</tr>
			</thead>
			<tbody>
				{division.rows.map((row) => (
					<Row
						key={row.tid}
						row={row}
						season={season}
						seasonOver={seasonOver}
						showDraws={showDraws}
						userTid={userTid}
					/>
				))}
			</tbody>
		</table>
	</ResponsiveTableWrapper>
);

const Legend = ({
	seasonOver,
	zones,
}: {
	seasonOver: boolean;
	zones: TableZone[];
}) => (
	<div className="d-flex flex-wrap gap-3 mb-3">
		{zones.map((zone) => (
			<div key={zone} className="d-flex align-items-center gap-1">
				<span
					style={{
						display: "inline-block",
						width: 4,
						height: "1.2em",
						backgroundColor: ZONES[zone].color,
					}}
				/>
				{ZONES[zone].text}
			</div>
		))}
		{seasonOver ? <div>(C) Champion</div> : null}
		{seasonOver ? (
			<div>
				<span className="text-success">▲</span> Promoted (P: through the
				playoff), <span className="text-danger">▼</span> Relegated
			</div>
		) : null}
		<div>Form: last 5 games, oldest first</div>
	</div>
);

const getZonesUsed = (divisions: DivisionTable[]) => {
	const used = new Set<TableZone>();
	for (const division of divisions) {
		for (const row of division.rows) {
			if (row.zone) {
				used.add(row.zone);
			}
		}
	}
	return (Object.keys(ZONES) as TableZone[]).filter((zone) => used.has(zone));
};

/**
 * Every Division in a World, grouped by Country, with a Country filter
 */
export const LeagueTables = ({
	season,
	userTid,
	worldTables,
}: {
	season: number;
	userTid: number;
	worldTables: WorldTables;
}) => {
	const [countryId, setCountryId] = useState<number | undefined>();

	const countries: { countryId: number; name: string }[] = [];
	for (const division of worldTables.divisions) {
		if (
			!countries.some((country) => country.countryId === division.countryId)
		) {
			countries.push({
				countryId: division.countryId,
				name: division.countryName,
			});
		}
	}

	const divisions =
		countryId === undefined
			? worldTables.divisions
			: worldTables.divisions.filter(
					(division) => division.countryId === countryId,
				);

	const showDraws = worldTables.divisions.some((division) =>
		division.rows.some((row) => row.tied > 0),
	);

	return (
		<>
			{countries.length > 1 ? (
				<select
					className="form-select mb-3"
					style={{ maxWidth: 250 }}
					value={countryId ?? "all"}
					onChange={(event) => {
						setCountryId(
							event.target.value === "all"
								? undefined
								: Number.parseInt(event.target.value),
						);
					}}
				>
					<option value="all">All countries</option>
					{countries.map((country) => (
						<option key={country.countryId} value={country.countryId}>
							{country.name}
						</option>
					))}
				</select>
			) : null}
			<Legend
				seasonOver={worldTables.seasonOver}
				zones={getZonesUsed(worldTables.divisions)}
			/>
			{divisions.map((division) => (
				<Fragment key={division.divisionId}>
					<h2 className="d-flex align-items-center gap-2 mb-0">
						<CountryFlag country={division.countryName} />
						{division.name}
					</h2>
					<div className="text-body-secondary mb-2">
						{division.countryName}, tier {division.tier}
					</div>
					<DivisionTableFull
						division={division}
						season={season}
						seasonOver={worldTables.seasonOver}
						showDraws={showDraws}
						userTid={userTid}
					/>
				</Fragment>
			))}
		</>
	);
};

const width100 = {
	width: "100%",
};

/**
 * One Division's table with just points, for the dashboard
 */
export const LeagueTableSmall = ({
	division,
	seasonOver,
	userTid,
}: {
	division: DivisionTable;
	seasonOver: boolean;
	userTid: number;
}) => (
	<>
		<table className="table table-striped table-borderless table-sm mb-1">
			<thead>
				<tr>
					<th className="text-end" title="Position">
						#
					</th>
					<th style={width100}>{division.name}</th>
					<th className="text-end" title="Played">
						P
					</th>
					<th className="text-end" title="Points">
						Pts
					</th>
				</tr>
			</thead>
			<tbody>
				{division.rows.map((row) => (
					<tr
						key={row.tid}
						className={clsx({ "table-info": row.tid === userTid })}
					>
						<td className="text-end" style={zoneStyle(row.zone)}>
							{row.rank}
						</td>
						<td style={{ maxWidth: 0 }}>
							<Club
								champion={seasonOver && row.rank === 1}
								includeName={false}
								row={row}
							/>
						</td>
						<td className="text-end">{row.played}</td>
						<td className="text-end fw-bold">{row.points}</td>
					</tr>
				))}
			</tbody>
		</table>
		<a href={helpers.leagueUrl(["standings"])}>» League Tables</a>
	</>
);
