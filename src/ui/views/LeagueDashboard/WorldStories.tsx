import type { View } from "../../../common/types.ts";
import { SafeHtml } from "../../components/SafeHtml.tsx";
import { helpers } from "../../util/helpers.ts";

// International Soccer Zen GM mod (storytelling): the World's biggest recent
// stories, wherever they happened
export const WorldStories = ({
	stories,
}: {
	stories: NonNullable<View<"leagueDashboard">["worldStories"]>;
}) => {
	if (stories.length === 0) {
		return null;
	}

	return (
		<div className="mb-3">
			<h2>Around the World</h2>
			<ul className="list-unstyled mb-1">
				{stories.map((story) => (
					<li key={story.eid} className="mb-1">
						<SafeHtml dirty={story.text} />
					</li>
				))}
			</ul>
			<a href={helpers.leagueUrl(["world_chronicle"])}>» Chronicle</a>
		</div>
	);
};
