"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

function normalizeEntryUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4096) throw new Error("A valid URL is required.");
  let url;
  try { url = new URL(raw); } catch { throw new Error("A valid URL is required."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only HTTP(S) URLs without embedded credentials can be saved.");
  }
  return url.href;
}

class BrowserLibrary {
  constructor(filePath, { maxHistory = 500, maxBookmarks = 200 } = {}) {
    this.filePath = filePath;
    this.maxHistory = maxHistory;
    this.maxBookmarks = maxBookmarks;
    this.history = [];
    this.bookmarks = [];
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      this.history = Array.isArray(data.history) ? data.history.slice(-this.maxHistory).filter(this.isValidStoredEntry) : [];
      this.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks.slice(0, this.maxBookmarks).filter(this.isValidStoredEntry) : [];
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      this.history = [];
      this.bookmarks = [];
    }
    return this.snapshot();
  }

  isValidStoredEntry(entry) {
    try {
      normalizeEntryUrl(entry.url);
      return typeof entry.title === "string" && typeof entry.visitedAt === "string";
    } catch {
      return false;
    }
  }

  snapshot() {
    return {
      history: this.history.map(entry => ({ ...entry })),
      bookmarks: this.bookmarks.map(entry => ({ ...entry }))
    };
  }

  async addHistory({ url: rawUrl, title = "" }) {
    const url = normalizeEntryUrl(rawUrl);
    const entry = { url, title: String(title).slice(0, 300), visitedAt: new Date().toISOString() };
    const last = this.history.at(-1);
    if (last && last.url === url && Date.now() - Date.parse(last.visitedAt) < 10_000) {
      last.title = entry.title || last.title;
      last.visitedAt = entry.visitedAt;
    } else {
      this.history.push(entry);
    }
    this.history = this.history.slice(-this.maxHistory);
    await this.persist();
    return { ...entry };
  }

  async addBookmark({ url: rawUrl, title = "" }) {
    const url = normalizeEntryUrl(rawUrl);
    const existing = this.bookmarks.find(entry => entry.url === url);
    if (existing) {
      existing.title = String(title).slice(0, 300) || existing.title;
      existing.visitedAt = new Date().toISOString();
      await this.persist();
      return { ...existing, alreadyBookmarked: true };
    }
    if (this.bookmarks.length >= this.maxBookmarks) throw new Error("Bookmark limit reached.");
    const entry = { url, title: String(title).slice(0, 300), visitedAt: new Date().toISOString() };
    this.bookmarks.unshift(entry);
    await this.persist();
    return { ...entry, alreadyBookmarked: false };
  }

  async removeBookmark(rawUrl) {
    const url = normalizeEntryUrl(rawUrl);
    const before = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter(entry => entry.url !== url);
    if (before !== this.bookmarks.length) await this.persist();
    return before !== this.bookmarks.length;
  }

  async clearHistory() {
    this.history = [];
    await this.persist();
  }

  async persist() {
    const snapshot = JSON.stringify({ version: 1, history: this.history, bookmarks: this.bookmarks }, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = this.filePath + "." + process.pid + ".tmp";
      await fs.writeFile(tempPath, snapshot, { encoding: "utf8", mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
    });
    return this.writeQueue;
  }
}

module.exports = { BrowserLibrary, normalizeEntryUrl };
