import type { View } from "../../../common/types.ts";
import { helpers } from "../../util/helpers.ts";

type Honours = NonNullable<View<"teamHistory">["worldHonours"]>;

const seasonList = (seasons: number[]) => seasons.join(", ");

// International Soccer Zen GM mod (storytelling): a World club's honours, in
// place of ZenGM's playoff appearances and championships
export const WorldHonours = ({
	honours,
	totalLost,
	totalOtl,
	totalTied,
	totalWinp,
	totalWon,
}: {
	honours: Honours;
} & Pick<
	View<"teamHistory">,
	"totalLost" | "totalOtl" | "totalTied" | "totalWinp" | "totalWon"
>) => {
	const record = helpers.formatRecord({
		won: totalWon,
		lost: totalLost,
		otl: totalOtl,
		tied: totalTied,
	});

	const lines: { label: string; value: string }[] = [];
	for (const title of honours.titles) {
		lines.push({
			label: `${title.divisionName} titles`,
			value: `${title.seasons.length} (${seasonList(title.seasons)})`,
		});
	}
	if (honours.titles.length === 0) {
		lines.push({ label: "Titles", value: "none" });
	}
	for (const dynasty of honours.dynasties) {
		lines.push({
			label: "Dynasty",
			value: `${dynasty.titles} titles, ${dynasty.from}–${dynasty.to}`,
		});
	}
	lines.push(
		{
			label: "Promotions",
			value:
				honours.promotions.length === 0
					? "none"
					: `${honours.promotions.length} (${honours.promotions
							.map(
								(promotion) =>
									`${promotion.season}${promotion.viaPlayoff ? " via playoff" : ""}`,
							)
							.join(", ")})`,
		},
		{
			label: "Relegations",
			value:
				honours.relegations.length === 0
					? "none"
					: `${honours.relegations.length} (${seasonList(honours.relegations)})`,
		},
	);
	if (honours.promotionPlayoffs.won + honours.promotionPlayoffs.lost > 0) {
		lines.push({
			label: "Promotion playoffs",
			value: `won ${honours.promotionPlayoffs.won}, lost ${honours.promotionPlayoffs.lost}`,
		});
	}
	if (honours.bestFinish) {
		const { bestFinish } = honours;
		lines.push({
			label: "Best finish",
			value: `${helpers.ordinal(bestFinish.position)} in the ${bestFinish.divisionName} (${seasonList(bestFinish.seasons)})`,
		});
	}
	for (const row of honours.seasonsByTier) {
		lines.push({
			label: `Seasons in the ${row.divisionName}`,
			value: String(row.seasons),
		});
	}
	if (honours.topTierRun.longest > 0) {
		lines.push({
			label: "Top flight",
			value:
				honours.topTierRun.current > 0
					? `${helpers.plural(`${honours.topTierRun.current} season`, honours.topTierRun.current)} in a row${
							honours.topTierRun.longest > honours.topTierRun.current
								? `, longest ${honours.topTierRun.longest}`
								: ""
						}`
					: `longest run ${honours.topTierRun.longest}`,
		});
	}
	if (honours.neverRelegated && honours.numSeasons > 1) {
		lines.push({ label: "Never relegated", value: "" });
	}

	return (
		<div className="mb-2">
			{honours.stature !== undefined ? (
				<div>
					Stature: {honours.stature} ({honours.statureLabel})
				</div>
			) : null}
			Record: {record} ({helpers.roundWinp(totalWinp)})
			{lines.map((line) => (
				<div key={`${line.label} ${line.value}`}>
					{line.label}
					{line.value ? `: ${line.value}` : null}
				</div>
			))}
			{honours.recordSigning ? (
				<div>
					Record signing:{" "}
					<a href={helpers.leagueUrl(["player", honours.recordSigning.pid])}>
						{honours.recordSigning.name}
					</a>
					, {helpers.formatCurrency(honours.recordSigning.fee / 1000, "M")} from{" "}
					{honours.recordSigning.sellerAbbrev ? (
						<a
							href={helpers.leagueUrl([
								"roster",
								`${honours.recordSigning.sellerAbbrev}_${honours.recordSigning.sellerTid}`,
								honours.recordSigning.season,
							])}
						>
							{honours.recordSigning.sellerRegion}
						</a>
					) : (
						"another club"
					)}{" "}
					({honours.recordSigning.season})
				</div>
			) : null}
		</div>
	);
};
