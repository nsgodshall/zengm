import { PLAYER } from "../../common/constants.ts";
import { helpers } from "../util/helpers.ts";
import { useLocal } from "../util/local.ts";

type Props = {
	tid: number;
	abbrev: string;
	className?: string;
	season?: number;
};

/**
 * International Soccer Zen GM mod: a team's full name by tid, for the `title`
 * of anywhere that shows only its abbreviation
 */
export const useTeamNames = () => {
	const { teamInfoCache } = useLocal(["teamInfoCache"]);
	return (tid: number) => {
		const t = teamInfoCache[tid];
		return t ? `${t.region} ${t.name}` : undefined;
	};
};

export const TeamAbbrevLink = ({ tid, abbrev, className, season }: Props) => {
	// International Soccer Zen GM mod: name the team in full on hover, since the
	// abbreviation is all there's room for
	const title = useTeamNames()(tid);

	if (!abbrev) {
		return null;
	}

	if (tid === PLAYER.DOES_NOT_EXIST) {
		return (
			<span className={className} title="Does Not Exist">
				DNE
			</span>
		);
	}

	if (tid === PLAYER.TOT) {
		return (
			<span
				className={className}
				title={season !== undefined ? `Total for ${season}` : "Total"}
			>
				TOT
			</span>
		);
	}

	let leagueUrlParam: Parameters<typeof helpers.leagueUrl>[0];

	if (tid === PLAYER.FREE_AGENT) {
		leagueUrlParam = ["free_agents"];
	} else if (tid === PLAYER.UNDRAFTED) {
		leagueUrlParam = ["draft_scouting"];
	} else if (tid < 0) {
		// Weird or retired
		return null;
	} else {
		leagueUrlParam = ["roster", `${abbrev}_${tid}`, season];
	}

	return (
		<a
			className={className}
			href={helpers.leagueUrl(leagueUrlParam)}
			title={title}
		>
			{abbrev}
		</a>
	);
};

export const wrappedTeamAbbrevLink = ({
	tid,
	abbrev,
	className,
	season,
}: Props) => {
	let text;
	if (!abbrev) {
		text = undefined;
	} else if (tid === PLAYER.DOES_NOT_EXIST) {
		text = "DNE";
	} else if (tid === PLAYER.TOT) {
		text = "TOT";
	} else if (tid < 0) {
		text = undefined;
	} else {
		text = abbrev;
	}

	return {
		value: (
			<TeamAbbrevLink
				tid={tid}
				abbrev={abbrev}
				className={className}
				season={season}
			/>
		),
		sortValue: text,
		searchValue: text,
	};
};
