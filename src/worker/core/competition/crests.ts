// International Soccer Zen GM mod (Epic 7): generated club crests. A crest is a
// shield in the club's kit colors with its abbreviation, as an SVG data URL, so
// it can go straight into a team's imgURL.

export const CREST_PATTERNS = [
	"plain",
	"stripes",
	"band",
	"sash",
	"halves",
] as const;

export type CrestPattern = (typeof CREST_PATTERNS)[number];

export const pickCrestPattern = (
	random: () => number = Math.random,
): CrestPattern =>
	CREST_PATTERNS[Math.floor(random() * CREST_PATTERNS.length)]!;

const SHIELD_PATH =
	"M50 4 L94 16 V58 C94 88 74 106 50 116 C26 106 6 88 6 58 V16 Z";

const escapeXml = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// The shapes of a pattern, in the second color, clipped to the shield
const getPatternShapes = (pattern: CrestPattern, color: string) => {
	switch (pattern) {
		case "plain":
			return "";
		case "stripes":
			return [14, 38, 62, 86]
				.map(
					(x) =>
						`<rect x="${x - 6}" y="0" width="12" height="120" fill="${color}"/>`,
				)
				.join("");
		case "band":
			return `<rect x="0" y="34" width="100" height="26" fill="${color}"/>`;
		case "sash":
			return `<polygon points="0,20 24,0 100,86 100,112" fill="${color}"/>`;
		case "halves":
			return `<rect x="0" y="0" width="50" height="120" fill="${color}"/>`;
	}
};

/**
 * A club's crest as SVG markup. `colors` are the club's kit colors: the
 * shield, its pattern, and the border and lettering.
 */
export const generateCrestSvg = ({
	abbrev,
	colors,
	pattern,
}: {
	abbrev: string;
	colors: [string, string, string];
	pattern: CrestPattern;
}) => {
	const [main, secondary, trim] = colors;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">`,
		`<defs><clipPath id="shield"><path d="${SHIELD_PATH}"/></clipPath></defs>`,
		`<g clip-path="url(#shield)">`,
		`<rect x="0" y="0" width="100" height="120" fill="${main}"/>`,
		getPatternShapes(pattern, secondary),
		`</g>`,
		`<path d="${SHIELD_PATH}" fill="none" stroke="${trim}" stroke-width="5"/>`,
		`<circle cx="50" cy="62" r="25" fill="${main}" stroke="${trim}" stroke-width="3"/>`,
		`<text x="50" y="71" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" fill="${trim}">${escapeXml(abbrev)}</text>`,
		`</svg>`,
	].join("");
};

// Lettering styles for generated logos, so clubs don't all look alike (decided
// with the user). Each is a font stack of the kind sports logos use, with its
// own weight, slant, spacing, and outline. Every stack ends in a generic family,
// since the fonts a player has depend on their machine.
export const LETTER_LOGO_STYLES = [
	"serif",
	"block",
	"slab",
	"condensed",
	"script",
	"varsity",
] as const;

export type LetterLogoStyle = (typeof LETTER_LOGO_STYLES)[number];

const LETTER_LOGO_FONTS: Record<
	LetterLogoStyle,
	{
		fontFamily: string;
		fontWeight: string;
		fontStyle?: string;
		letterSpacing?: number;
		strokeWidth: number;
		scale: number;
	}
> = {
	serif: {
		fontFamily: "Georgia, 'Times New Roman', serif",
		fontWeight: "bold",
		strokeWidth: 4,
		scale: 1,
	},
	block: {
		fontFamily: "'Arial Black', 'Liberation Sans', Arial, sans-serif",
		fontWeight: "900",
		letterSpacing: -2,
		strokeWidth: 4,
		scale: 0.92,
	},
	slab: {
		fontFamily: "Rockwell, 'Courier New', Georgia, serif",
		fontWeight: "bold",
		strokeWidth: 4,
		scale: 0.96,
	},
	condensed: {
		fontFamily:
			"'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue', sans-serif",
		fontWeight: "bold",
		letterSpacing: 1,
		strokeWidth: 3,
		scale: 1.08,
	},
	script: {
		fontFamily: "'Brush Script MT', 'URW Chancery L', 'Segoe Script', cursive",
		fontWeight: "bold",
		fontStyle: "italic",
		strokeWidth: 3,
		scale: 1.06,
	},
	varsity: {
		fontFamily: "Impact, 'Liberation Sans Narrow', 'Arial Narrow', sans-serif",
		fontWeight: "normal",
		letterSpacing: 1,
		strokeWidth: 5,
		scale: 1.02,
	},
};

/** The style a club's letters fall back to, the same one every time */
export const pickLetterLogoStyle = (letters: string): LetterLogoStyle =>
	LETTER_LOGO_STYLES[
		[...letters].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) %
			LETTER_LOGO_STYLES.length
	]!;

/**
 * A baseball cap-style letter logo as SVG markup, for a real club with no
 * letter logo of its own (decided with the user): `letters` in the club's first
 * color, outlined in its second, on a clear background, in one of
 * LETTER_LOGO_STYLES. More letters are drawn smaller, so up to three fit.
 */
export const generateLetterLogoSvg = ({
	letters,
	colors,
	style = pickLetterLogoStyle(letters),
}: {
	letters: string;
	colors: [string, string, string];
	style?: LetterLogoStyle;
}) => {
	const [fill, outline] = colors;
	const font = LETTER_LOGO_FONTS[style];
	const fontSize = Math.round(
		(letters.length <= 1 ? 96 : letters.length === 2 ? 68 : 48) * font.scale,
	);
	const attributes = [
		`font-family="${font.fontFamily}"`,
		`font-size="${fontSize}"`,
		`font-weight="${font.fontWeight}"`,
		...(font.fontStyle ? [`font-style="${font.fontStyle}"`] : []),
		...(font.letterSpacing ? [`letter-spacing="${font.letterSpacing}"`] : []),
		`fill="${fill}"`,
		`stroke="${outline}"`,
		`stroke-width="${font.strokeWidth}"`,
	].join(" ");
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
		`<text x="50" y="50" text-anchor="middle" dominant-baseline="central" ${attributes} stroke-linejoin="round" paint-order="stroke">${escapeXml(letters)}</text>`,
		`</svg>`,
	].join("");
};

/** SVG markup as a data URL, for an <img> src or a team's imgURL */
export const getCrestDataUrl = (svg: string) =>
	`data:image/svg+xml,${encodeURIComponent(svg)}`;
