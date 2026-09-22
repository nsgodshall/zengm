// International Soccer Zen GM mod (Epic 7): draw the USA clubs' crests with
// OpenAI's image API, one PNG a club, from the blazons in crest-blazons.js.
//
//   OPENAI_API_KEY=sk-... node tools/generate-crests.js
//   node tools/generate-crests.js --only spokane-beavers,boise-broncos
//   node tools/generate-crests.js --dry-run          # print a prompt, call nothing
//
// Images land in --out (./crests by default), named after the club, and a club
// that already has a file there is skipped unless --force. Nothing is copied
// into public/img: look at them first, then move the ones you want.
//
// This calls a paid API. Every image costs money, so it asks for confirmation
// before a run of more than --confirm-over clubs (10 by default).

import { createInterface } from "node:readline/promises";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CREST_BLAZONS } from "./crest-blazons.js";

// Decided with the user: the badges shouldn't all look like the same badge. Each
// club gets its own shape, drawing manner, lettering and bordure, picked from
// its slug so a rerun draws the same club the same way.
const SHAPES = [
	"a heater shield",
	"a roundel",
	"a shield with a pointed base",
	"an oval cartouche",
	"a lozenge standing on its point",
	"a shield with a curved chief and squared base",
	"a shield couped and arched",
];

const MANNERS = [
	"flat vector, thick confident outlines",
	"flat vector, fine engraved linework over solid grounds",
	"bold modern vector, heavy simplified shapes, the detail cut away",
	"flat vector cut like a woodblock print, chiselled edges",
	"flat vector, the charges drawn as clean silhouettes with a single interior line",
];

const LETTERING = [
	"a condensed serif",
	"a slab serif",
	"a narrow blackletter",
	"a wide grotesque",
	"a stencilled sans",
];

const BORDURES = [
	"within a plain bordure",
	"within a cabled bordure",
	"within a bordure beaded of the trim tincture",
	"with no bordure, the field running to the edge",
	"within a narrow double fillet",
];

// Same slug, same badge, every run
const pick = (list, slug, salt) => {
	let hash = salt;
	for (const character of slug) {
		hash = (hash * 31 + character.codePointAt(0)) % 100003;
	}
	return list[hash % list.length];
};

const buildPrompt = (crest) => {
	const shape = pick(SHAPES, crest.slug, 7);
	const manner = pick(MANNERS, crest.slug, 13);
	const lettering = pick(LETTERING, crest.slug, 29);
	const bordure = pick(BORDURES, crest.slug, 53);

	const preamble = [
		`An armorial achievement drawn as a modern football club badge on ${shape}, the field divided as blazoned, the principal charge boldly drawn, lesser charges in chief and base, ${bordure}.`,
		`${manner[0].toUpperCase()}${manner.slice(1)}, no more than four tinctures, no gradients, no drop shadows, transparent background - a club crest, not a page from a medieval roll of arms.`,
		`Where the blazon calls for letters or numerals, render them in ${lettering}, evenly spaced and integral to the badge, never as a caption.`,
		"A date is the year the club was founded. The silhouette must read at 32 pixels.",
	].join(" ");

	return `${preamble}\n\nBlazon: ${crest.blazon}\n\nTinctures, exactly: ${crest.colors}.`;
};

const parseArgs = (argv) => {
	const args = {
		out: "crests",
		size: "1024x1024",
		quality: "high",
		model: "gpt-image-1",
		concurrency: 2,
		retries: 5,
		confirmOver: 10,
		only: undefined,
		force: false,
		dryRun: false,
		list: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) {
				throw new Error(`${arg} needs a value`);
			}
			return next;
		};
		switch (arg) {
			case "--out":
				args.out = value();
				break;
			case "--size":
				args.size = value();
				break;
			case "--quality":
				args.quality = value();
				break;
			case "--model":
				args.model = value();
				break;
			case "--concurrency":
				args.concurrency = Number.parseInt(value());
				break;
			case "--retries":
				args.retries = Number.parseInt(value());
				break;
			case "--confirm-over":
				args.confirmOver = Number.parseInt(value());
				break;
			case "--only":
				args.only = new Set(
					value()
						.split(",")
						.map((slug) => slug.trim()),
				);
				break;
			case "--force":
				args.force = true;
				break;
			case "--dry-run":
				args.dryRun = true;
				break;
			case "--list":
				args.list = true;
				break;
			default:
				throw new Error(`Unknown argument ${arg}`);
		}
	}
	return args;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One image, retrying while OpenAI is rate limiting us or having a bad day */
const generate = async (crest, args, apiKey) => {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(
			"https://api.openai.com/v1/images/generations",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: args.model,
					prompt: buildPrompt(crest),
					n: 1,
					size: args.size,
					quality: args.quality,
					background: "transparent",
					output_format: "png",
				}),
			},
		);

		if (response.ok) {
			const body = await response.json();
			const b64 = body.data?.[0]?.b64_json;
			if (!b64) {
				throw new Error(`${crest.slug}: no image in the response`);
			}
			return Buffer.from(b64, "base64");
		}

		const text = await response.text();
		const retryable = response.status === 429 || response.status >= 500;
		if (!retryable || attempt >= args.retries) {
			throw new Error(
				`${crest.slug}: ${response.status} ${text.slice(0, 300)}`,
			);
		}
		const wait = Math.min(
			Number(response.headers.get("retry-after") ?? 2 ** attempt * 5),
			120,
		);
		console.log(`  ${crest.slug}: ${response.status}, waiting ${wait}s`);
		await sleep(wait * 1000);
	}
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));

	let crests = CREST_BLAZONS;
	if (args.only) {
		const slugs = new Set(CREST_BLAZONS.map((crest) => crest.slug));
		for (const slug of args.only) {
			if (!slugs.has(slug)) {
				throw new Error(`No crest called ${slug}. --list shows them all.`);
			}
		}
		crests = crests.filter((crest) => args.only.has(crest.slug));
	}

	if (args.list) {
		for (const crest of crests) {
			console.log(`${crest.slug}\t${crest.club}`);
		}
		return;
	}

	if (args.dryRun) {
		for (const crest of crests) {
			console.log(
				`=== ${crest.club} (${crest.slug}.png)\n${buildPrompt(crest)}\n`,
			);
		}
		return;
	}

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error("Set OPENAI_API_KEY to your OpenAI API key");
	}

	await mkdir(args.out, { recursive: true });
	if (!args.force) {
		const existing = new Set(await readdir(args.out));
		const skipped = crests.filter((crest) => existing.has(`${crest.slug}.png`));
		if (skipped.length > 0) {
			console.log(
				`Already in ${args.out}, skipping ${skipped.length}. --force redraws them.`,
			);
			crests = crests.filter((crest) => !existing.has(`${crest.slug}.png`));
		}
	}

	if (crests.length === 0) {
		console.log("Nothing to draw");
		return;
	}

	if (crests.length > args.confirmOver && process.stdin.isTTY) {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await rl.question(
			`Draw ${crests.length} crests with ${args.model} at ${args.quality} quality? This costs money. [y/N] `,
		);
		rl.close();
		if (answer.trim().toLowerCase() !== "y") {
			console.log("Nothing drawn");
			return;
		}
	}

	console.log(`Drawing ${crests.length} crests into ${args.out}/`);
	const queue = [...crests];
	const failures = [];
	let done = 0;

	const worker = async () => {
		while (true) {
			const crest = queue.shift();
			if (!crest) {
				return;
			}
			try {
				const png = await generate(crest, args, apiKey);
				const file = path.join(args.out, `${crest.slug}.png`);
				await writeFile(file, png);
				done += 1;
				console.log(`[${done}/${crests.length}] ${file} (${png.length} bytes)`);
			} catch (error) {
				failures.push(`${crest.slug}: ${error.message}`);
				console.error(`  ${error.message}`);
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.max(1, args.concurrency) }, worker),
	);

	console.log(`Drew ${done} of ${crests.length}`);
	if (failures.length > 0) {
		console.error(`Failed:\n  ${failures.join("\n  ")}`);
		process.exitCode = 1;
	}
};

try {
	await main();
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
