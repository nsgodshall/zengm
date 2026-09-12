import { IDBKeyRange } from "fake-indexeddb";
// @ts-expect-error
import fs from "node:fs/promises";
import { overridePostMessage } from "./overridePostMessage.ts";

// When mockIDBLeague is used, sometimes IDBKeyRange still gets called even though there is no actual database
globalThis.IDBKeyRange = IDBKeyRange;

overridePostMessage();

globalThis.fetch = async (url: Parameters<typeof fetch>[0]) => {
	if (typeof url !== "string") {
		throw new Error("Not supported");
	}

	let filePath = url.replace("/gen/", "data/");
	if (filePath.endsWith("real-player-data.json")) {
		filePath = filePath.replace(".json", `.${__SPORT}.json`);
	}

	const data = await fs.readFile(filePath, "utf8");
	return new Response(data);
};

// Removes the need for jsdom in most test files
(globalThis as any).self = globalThis;
(globalThis as any).window = globalThis;
(globalThis as any).location = {};
globalThis.addEventListener = () => {};

// promise-worker-bi (used by worker/util/promiseWorker.ts) coordinates
// multiple worker instances via the Web Locks API (navigator.locks). Node's
// built-in `navigator` global doesn't implement it (this isn't a Node
// version gap we can fix by upgrading — Web Locks is a browser API, not a
// Node one), so tests never actually run in more than one instance anyway.
// This is a minimal shim: it just runs the callback immediately without any
// real locking semantics, which is fine since unit tests aren't exercising
// cross-worker coordination.
if (!(globalThis as any).navigator) {
	(globalThis as any).navigator = {};
}
if (!(globalThis as any).navigator.locks) {
	(globalThis as any).navigator.locks = {
		request: (name: string, callback: (lock: unknown) => unknown) =>
			Promise.resolve(callback({ name, mode: "exclusive" })),
	};
}
