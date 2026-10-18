"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { BrowserLibrary, normalizeEntryUrl } = require("../library");

async function temporaryLibrary(options) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-library-"));
  const library = new BrowserLibrary(path.join(directory, "library.json"), options);
  await library.load();
  return { library, directory };
}

test("persists history and bookmarks and reloads them", async () => {
  const { library, directory } = await temporaryLibrary();
  try {
    await library.addHistory({ url: "https://example.com", title: "Example" });
    await library.addBookmark({ url: "https://example.com", title: "Example Domain" });
    const reloaded = new BrowserLibrary(path.join(directory, "library.json"));
    const data = await reloaded.load();
    assert.equal(data.history.length, 1);
    assert.equal(data.history[0].title, "Example");
    assert.equal(data.bookmarks.length, 1);
    assert.equal(data.bookmarks[0].url, "https://example.com/");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("bounds history and prevents duplicate bookmarks", async () => {
  const { library, directory } = await temporaryLibrary({ maxHistory: 2, maxBookmarks: 2 });
  try {
    await library.addHistory({ url: "https://one.example", title: "One" });
    await library.addHistory({ url: "https://two.example", title: "Two" });
    await library.addHistory({ url: "https://three.example", title: "Three" });
    assert.deepEqual(library.snapshot().history.map(item => item.title), ["Two", "Three"]);
    await library.addBookmark({ url: "https://example.com", title: "First title" });
    const duplicate = await library.addBookmark({ url: "https://example.com/", title: "Updated title" });
    assert.equal(duplicate.alreadyBookmarked, true);
    assert.equal(library.snapshot().bookmarks.length, 1);
    assert.equal(library.snapshot().bookmarks[0].title, "Updated title");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects non-web URLs and URLs containing credentials", async () => {
  assert.throws(() => normalizeEntryUrl("file:///etc/passwd"));
  assert.throws(() => normalizeEntryUrl("https://user:pass@example.com"));
  const { library, directory } = await temporaryLibrary();
  try {
    await assert.rejects(library.addBookmark({ url: "javascript:alert(1)" }));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("removes bookmarks and clears history", async () => {
  const { library, directory } = await temporaryLibrary();
  try {
    await library.addHistory({ url: "https://example.com", title: "Example" });
    await library.addBookmark({ url: "https://example.com", title: "Example" });
    assert.equal(await library.removeBookmark("https://example.com/"), true);
    assert.equal(await library.removeBookmark("https://example.com/"), false);
    await library.clearHistory();
    assert.equal(library.snapshot().history.length, 0);
    assert.equal(library.snapshot().bookmarks.length, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
