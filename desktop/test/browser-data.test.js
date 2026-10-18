"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { BrowserDataStore, safeHttpUrl } = require("../browser-data");

async function temporaryStore(options) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-browser-data-"));
  const store = new BrowserDataStore(path.join(directory, "browser-data.json"), options);
  await store.load();
  return { directory, store };
}

test("history persists safe URLs and suppresses duplicate navigation events", async t => {
  const { directory, store } = await temporaryStore({ maxHistory: 3 });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(await store.recordVisit({ url: "https://example.com/", title: "Example" }), true);
  assert.equal(await store.recordVisit({ url: "https://example.com/", title: "Example Updated" }), true);
  assert.equal(store.getHistory().length, 1);
  assert.equal(store.getHistory()[0].title, "Example Updated");
  await store.recordVisit({ url: "https://example.org/", title: "Other" });
  await store.recordVisit({ url: "https://example.net/", title: "Third" });
  await store.recordVisit({ url: "https://example.edu/", title: "Fourth" });
  assert.equal(store.getHistory().length, 3);
  assert.equal(store.getHistory()[0].url, "https://example.edu/");
  const restored = new BrowserDataStore(path.join(directory, "browser-data.json"), { maxHistory: 3 });
  await restored.load();
  assert.equal(restored.getHistory().length, 3);
});

test("bookmarks are deduplicated, removable, and persistent", async t => {
  const { directory, store } = await temporaryStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.addBookmark({ url: "https://example.com/", title: "First title" });
  await store.addBookmark({ url: "https://example.com/", title: "Updated title" });
  assert.equal(store.getBookmarks().length, 1);
  assert.equal(store.getBookmarks()[0].title, "Updated title");
  const restored = new BrowserDataStore(path.join(directory, "browser-data.json"));
  await restored.load();
  assert.equal(restored.getBookmarks()[0].url, "https://example.com/");
  assert.equal(await restored.removeBookmark("https://example.com/"), true);
  assert.equal(await restored.removeBookmark("https://example.com/"), false);
});

test("history and bookmarks reject unsafe URLs and embedded credentials", async t => {
  const { directory, store } = await temporaryStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(safeHttpUrl("file:///etc/passwd"), null);
  assert.equal(safeHttpUrl("https://user:pass@example.com"), null);
  assert.equal(await store.recordVisit({ url: "javascript:alert(1)", title: "bad" }), false);
  await assert.rejects(store.addBookmark({ url: "file:///etc/passwd", title: "bad" }));
  assert.equal(store.getHistory().length, 0);
  assert.equal(store.getBookmarks().length, 0);
});
