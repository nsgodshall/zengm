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

/** SVG markup as a data URL, for an <img> src or a team's imgURL */
export const getCrestDataUrl = (svg: string) =>
	`data:image/svg+xml,${encodeURIComponent(svg)}`;
