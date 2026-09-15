import { describe, expect, test } from "vitest";
import {
	CREST_PATTERNS,
	generateCrestSvg,
	generateLetterLogoSvg,
	getCrestDataUrl,
	LETTER_LOGO_STYLES,
	pickCrestPattern,
	pickLetterLogoStyle,
} from "./crests.ts";

const colors: [string, string, string] = ["#c8102e", "#ffffff", "#000000"];

describe("generateLetterLogoSvg", () => {
	test("is the letters in the club's first color, outlined in its second", () => {
		const svg = generateLetterLogoSvg({ letters: "SD", colors });
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg.endsWith("</svg>")).toBe(true);
		expect(svg).toContain(">SD</text>");
		expect(svg).toContain(`fill="${colors[0]}"`);
		expect(svg).toContain(`stroke="${colors[1]}"`);
	});

	test("more letters are drawn smaller, so they fit", () => {
		const fontSize = (letters: string) =>
			Number(
				/font-size="(\d+)"/.exec(
					generateLetterLogoSvg({ letters, colors }),
				)![1],
			);
		expect(fontSize("S")).toBeGreaterThan(fontSize("SD"));
		expect(fontSize("SD")).toBeGreaterThan(fontSize("SEA"));
	});

	test("escapes the letters", () => {
		expect(generateLetterLogoSvg({ letters: "A&", colors })).toContain(
			">A&amp;</text>",
		);
	});

	test("every style letters a club differently", () => {
		const svgs = LETTER_LOGO_STYLES.map((style) =>
			generateLetterLogoSvg({ letters: "SD", colors, style }),
		);
		expect(new Set(svgs).size).toBe(LETTER_LOGO_STYLES.length);
		for (const svg of svgs) {
			expect(svg).toContain(">SD</text>");
		}
	});

	test("a club with no style of its own gets the same one every time", () => {
		expect(pickLetterLogoStyle("PIT")).toBe(pickLetterLogoStyle("PIT"));
		expect(LETTER_LOGO_STYLES).toContain(pickLetterLogoStyle("PIT"));
		expect(generateLetterLogoSvg({ letters: "PIT", colors })).toBe(
			generateLetterLogoSvg({
				letters: "PIT",
				colors,
				style: pickLetterLogoStyle("PIT"),
			}),
		);
	});
});

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
