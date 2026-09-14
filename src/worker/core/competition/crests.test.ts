import { describe, expect, test } from "vitest";
import {
	CREST_PATTERNS,
	generateCrestSvg,
	getCrestDataUrl,
	pickCrestPattern,
} from "./crests.ts";

const colors: [string, string, string] = ["#c8102e", "#ffffff", "#000000"];

describe("generateCrestSvg", () => {
	test("is a shield in the club's colors with its abbreviation", () => {
		const svg = generateCrestSvg({ abbrev: "STO", colors, pattern: "band" });
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg.endsWith("</svg>")).toBe(true);
		expect(svg).toContain(">STO</text>");
		for (const color of colors) {
			expect(svg).toContain(`"${color}"`);
		}
	});

	test("every pattern gives a different crest", () => {
		const svgs = CREST_PATTERNS.map((pattern) =>
			generateCrestSvg({ abbrev: "STO", colors, pattern }),
		);
		expect(new Set(svgs).size).toBe(CREST_PATTERNS.length);
	});

	test("the same club gets the same crest", () => {
		expect(generateCrestSvg({ abbrev: "RCF", colors, pattern: "sash" })).toBe(
			generateCrestSvg({ abbrev: "RCF", colors, pattern: "sash" }),
		);
	});

	test("escapes the abbreviation", () => {
		expect(
			generateCrestSvg({ abbrev: "A&<", colors, pattern: "plain" }),
		).toContain(">A&amp;&lt;</text>");
	});
});

describe("pickCrestPattern", () => {
	test("picks every pattern from the random number", () => {
		expect(pickCrestPattern(() => 0)).toBe(CREST_PATTERNS[0]);
		expect(pickCrestPattern(() => 0.999)).toBe(CREST_PATTERNS.at(-1));
	});
});

describe("getCrestDataUrl", () => {
	test("encodes the SVG as a data URL", () => {
		const svg = generateCrestSvg({ abbrev: "STO", colors, pattern: "plain" });
		const url = getCrestDataUrl(svg);
		expect(url.startsWith("data:image/svg+xml,")).toBe(true);
		expect(decodeURIComponent(url.slice("data:image/svg+xml,".length))).toBe(
			svg,
		);
	});
});
