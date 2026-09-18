import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { useParentSize } from "@visx/responsive";
import { scaleLinear, scalePoint } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { Text } from "@visx/text";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import type { MouseEvent } from "react";
import type { View } from "../../../common/types.ts";
import { helpers } from "../../util/helpers.ts";

// International Soccer Zen GM mod (Epic 6): a club's place in its Country's
// pyramid season by season, like the league history charts on soccer clubs'
// Wikipedia pages, from competition.getLeagueHistory

type LeagueHistory = NonNullable<View<"teamHistory">["leagueHistory"]>;
type Season = LeagueHistory["seasons"][number];

const HEIGHT = 260;
const MARGIN = { top: 10, right: 15, bottom: 30, left: 40 };

// Room for each season's label on the x axis
const MIN_TICK_WIDTH = 45;

export const LeagueHistoryChart = ({
	leagueHistory,
}: {
	leagueHistory: LeagueHistory;
}) => {
	const { bands, numPlaces, seasons } = leagueHistory;

	const { parentRef, ...parent } = useParentSize();
	const width = Math.max(0, parent.width - MARGIN.left - MARGIN.right);

	const seasonLabels = seasons.map((row) => String(row.season));
	const xScale = scalePoint({
		domain: seasonLabels,
		range: [0, width],
		padding: 0.5,
	});

	// 1 is the top of the chart, with half a place of room around each end
	const yScale = scaleLinear({
		domain: [0.5, numPlaces + 0.5],
		range: [0, HEIGHT],
	});

	const tickEvery = Math.max(
		1,
		Math.ceil(seasonLabels.length / Math.max(1, width / MIN_TICK_WIDTH)),
	);

	const {
		tooltipData,
		tooltipLeft,
		tooltipTop,
		tooltipOpen,
		showTooltip,
		hideTooltip,
	} = useTooltip<Season>();

	const handleMouseOver = (event: MouseEvent<SVGElement>, datum: Season) => {
		const coords = localPoint(event.currentTarget.ownerSVGElement!, event);
		if (coords) {
			showTooltip({
				tooltipLeft: coords.x,
				tooltipTop: coords.y,
				tooltipData: datum,
			});
		}
	};

	const x = (row: Season) => xScale(String(row.season)) ?? 0;
	const y = (row: Season) => yScale(row.pyramidPosition);

	// A little triangle above a promotion or below a relegation
	const arrow = (x: number, y: number, moved: "promoted" | "relegated") => {
		const point = moved === "promoted" ? y - 8 : y + 8;
		const base = moved === "promoted" ? y - 14 : y + 14;
		return `M ${x} ${point} L ${x - 4} ${base} L ${x + 4} ${base} Z`;
	};

	return (
		<div className="position-relative" ref={parentRef}>
			<svg width={parent.width} height={HEIGHT + MARGIN.top + MARGIN.bottom}>
				<Group left={MARGIN.left} top={MARGIN.top}>
					{bands.map((band, i) => {
						const top = yScale(band.first - 0.5);
						const bottom = yScale(band.last + 0.5);
						return (
							<g key={band.tier}>
								<rect
									fill={i % 2 === 0 ? "var(--bs-secondary-bg)" : "transparent"}
									height={bottom - top}
									width={width}
									x={0}
									y={top}
								/>
								<Text
									fill="var(--bs-secondary-color)"
									fontSize={12}
									textAnchor="end"
									verticalAnchor="start"
									x={width - 5}
									y={top + 4}
								>
									{band.name}
								</Text>
							</g>
						);
					})}
					<LinePath
						className="chart-line"
						data={seasons}
						stroke="var(--bs-primary)"
						strokeWidth={2}
						x={x}
						y={y}
					/>
					{/* International Soccer Zen GM mod (storytelling, Phase 5): the
					seasons a club won its Division or went up or down are marked */}
					{seasons.map((row) => (
						<g
							key={row.season}
							onMouseOut={hideTooltip}
							onMouseOver={(event) => {
								handleMouseOver(event, row);
							}}
						>
							{row.moved ? (
								<path
									d={arrow(x(row), y(row), row.moved)}
									fill={
										row.moved === "promoted"
											? "var(--bs-success)"
											: "var(--bs-danger)"
									}
								/>
							) : null}
							<circle
								cx={x(row)}
								cy={y(row)}
								fill={
									row.inProgress
										? "var(--bs-body-bg)"
										: row.champion
											? "var(--bs-warning)"
											: "var(--bs-primary)"
								}
								r={row.champion ? 5 : 4}
								stroke={
									row.champion ? "var(--bs-warning)" : "var(--bs-primary)"
								}
								strokeWidth={2}
							/>
						</g>
					))}
					<AxisLeft
						axisClassName="chart-axis"
						scale={yScale}
						tickFormat={String}
						tickLength={5}
						tickValues={bands.map((band) => band.first)}
					/>
					<AxisBottom
						axisClassName="chart-axis"
						scale={xScale}
						tickLength={5}
						tickValues={seasonLabels.filter((_, i) => i % tickEvery === 0)}
						top={HEIGHT}
					/>
				</Group>
			</svg>
			{tooltipOpen && tooltipData ? (
				<TooltipWithBounds
					key={tooltipData.season}
					left={tooltipLeft}
					top={tooltipTop}
				>
					<b>{tooltipData.season}</b>
					{tooltipData.inProgress ? " (in progress)" : null}
					<br />
					{helpers.ordinal(tooltipData.position)} of {tooltipData.numClubs} in
					the {tooltipData.divisionName}
					{tooltipData.champion ? " (champions)" : null}
					{tooltipData.moved ? `, ${tooltipData.moved}` : null}
				</TooltipWithBounds>
			) : null}
			<div className="text-body-secondary small">
				The club's place in its country's league pyramid each season, where 1 is
				the top of the top tier. Gold marks a title, an arrow a promotion or a
				relegation.
			</div>
		</div>
	);
};
