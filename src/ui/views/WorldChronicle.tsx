import { CountryFlag } from "../components/CountryFlag.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import { SafeHtml } from "../components/SafeHtml.tsx";
import { TeamLogoInline } from "../components/TeamLogoInline.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";
import type { View } from "../../common/types.ts";

type Club = {
	tid: number;
	abbrev: string;
	region: string;
	name: string;
	imgURL?: string;
	imgURLSmall?: string;
};

const ClubLink = ({
	club,
	season,
	userTid,
}: {
	club: Club;
	season: number;
	userTid: number;
}) => (
	<a
		className={club.tid === userTid ? "fw-bold" : undefined}
		href={helpers.leagueUrl(["roster", `${club.abbrev}_${club.tid}`, season])}
	>
		{club.region} {club.name}
	</a>
);

const ClubList = ({
	clubs,
	season,
	userTid,
}: {
	clubs: (Club & { viaPlayoff?: boolean })[];
	season: number;
	userTid: number;
}) => (
	<>
		{clubs.map((club, i) => (
			<span key={club.tid}>
				{i > 0 ? ", " : null}
				<ClubLink club={club} season={season} userTid={userTid} />
				{club.viaPlayoff ? " (P)" : null}
			</span>
		))}
	</>
);

// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 5): a World's Chronicle, the stories and results of a finished season in
// every Country, the user's first
const WorldChronicle = ({
	countries,
	hasSeason,
	season,
}: View<"worldChronicle">) => {
	useTitleBar({
		title: "Chronicle",
		jumpTo: true,
		jumpToSeason: season,
		dropdownView: "world_chronicle",
		dropdownFields: {
			seasonsHistory: season,
		},
	});
	const { userTid } = useLocal(["userTid"]);

	return (
		<>
			<MoreLinks type="league" page="world_chronicle" />

			{!hasSeason ? (
				<p>The {season} season hasn't finished yet.</p>
			) : (
				<p>
					<a href={helpers.leagueUrl(["history", season])}>Season Summary</a>
					{" · "}
					<a href={helpers.leagueUrl(["standings", season])}>League Tables</a>
				</p>
			)}

			{hasSeason
				? countries.map((country) => {
						const [headline, ...stories] = country.stories;
						return (
							<div key={country.countryId} className="mb-4">
								<h2>
									<CountryFlag className="me-2" country={country.name} />
									{country.name}
								</h2>
								{headline ? (
									<p className="lead">
										<SafeHtml dirty={headline.text} />
									</p>
								) : null}
								<div className="row">
									<div className="col-md-6">
										{stories.length > 0 ? (
											<ul className="list-unstyled">
												{stories.map((story) => (
													<li key={story.eid} className="mb-2">
														<SafeHtml dirty={story.text} />
													</li>
												))}
											</ul>
										) : headline ? null : (
											<p className="text-body-secondary">
												A season without any big stories.
											</p>
										)}
									</div>
									<div className="col-md-6">
										{country.divisions.map((division) => (
											<div key={division.divisionId} className="mb-3">
												<h3 className="mb-1">{division.name}</h3>
												{division.champion ? (
													<div className="d-flex align-items-center">
														<span className="me-1">Champions:</span>
														<TeamLogoInline
															imgURL={division.champion.imgURL}
															imgURLSmall={division.champion.imgURLSmall}
														/>
														<span className="ms-1">
															<ClubLink
																club={division.champion}
																season={season}
																userTid={userTid}
															/>{" "}
															({division.champion.points} pts)
														</span>
													</div>
												) : null}
												{division.promoted.length > 0 ? (
													<div>
														Promoted:{" "}
														<ClubList
															clubs={division.promoted}
															season={season}
															userTid={userTid}
														/>
													</div>
												) : null}
												{division.relegated.length > 0 ? (
													<div>
														Relegated:{" "}
														<ClubList
															clubs={division.relegated}
															season={season}
															userTid={userTid}
														/>
													</div>
												) : null}
											</div>
										))}
									</div>
								</div>
							</div>
						);
					})
				: null}
		</>
	);
};

export default WorldChronicle;
