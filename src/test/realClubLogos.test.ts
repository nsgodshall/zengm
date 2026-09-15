// @ts-expect-error
import { existsSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { WORLD_COUNTRIES } from "../worker/core/competition/worldCountries.ts";

// International Soccer Zen GM mod (Epic 7): real clubs show crests and logos
// copied into public/, which the build copies alongside the game, or a
// generated logo (see generateLetterLogoSvg)
test("every real club's crest or logo is a file in public/, or generated", () => {
	const clubs = WORLD_COUNTRIES.flatMap((country) =>
		(country.realClubsByTier ?? []).flat(),
	);
	const fileClubs = clubs.filter(
		(club) => !club.imgURL.startsWith("data:image/svg+xml,"),
	);
	expect(fileClubs.length).toBeGreaterThan(0);
	for (const club of fileClubs) {
		const path = `public${club.imgURL}`;
		expect(existsSync(path), path).toBe(true);
		expect(statSync(path).size, path).toBeGreaterThan(0);
	}
});
