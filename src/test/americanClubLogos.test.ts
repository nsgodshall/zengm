// @ts-expect-error
import { existsSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { AMERICAN_REAL_CLUBS } from "../worker/core/competition/americanClubs.ts";

// International Soccer Zen GM mod (Epic 7): the USA's real top-tier clubs show
// logos copied into public/, which the build copies alongside the game
test("every real American club's logo is a file in public/", () => {
	for (const club of AMERICAN_REAL_CLUBS) {
		const path = `public${club.imgURL}`;
		expect(existsSync(path), path).toBe(true);
		expect(statSync(path).size, path).toBeGreaterThan(0);
	}
});
