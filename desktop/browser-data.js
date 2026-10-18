"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

function safeHttpUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function cleanEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const url = safeHttpUrl(entry.url);
  if (!url) return null;
  return {
    url,
    title: typeof entry.title === "string" ? entry.title.slice(0, 300) : url,
    visitedAt: Number.isFinite(entry.visitedAt) ? entry.visitedAt : Date.now()
  };
}

class BrowserDataStore {
  constructor(filePath, { maxHistory = 500, maxBookmarks = 500 } = {}) {
    if (!filePath || typeof filePath !== "string") throw new TypeError("A data file path is required.");
    if (!Number.isInteger(maxHistory) || maxHistory < 1) throw new RangeError("maxHistory must be positive.");
    if (!Number.isInteger(maxBookmarks) || maxBookmarks < 1) throw new RangeError("maxBookmarks must be positive.");
    this.filePath = filePath;
    this.maxHistory = maxHistory;
    this.maxBookmarks = maxBookmarks;
    this.data = { version: 1, history: [], bookmarks: [] };
    this._writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      this.data = {
        version: 1,
        history: Array.isArray(raw.history) ? raw.history.map(cleanEntry).filter(Boolean).slice(0, this.maxHistory) : [],
        bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks.map(cleanEntry).filter(Boolean).slice(0, this.maxBookmarks) : []
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Browser history/bookmark data could not be read safely.");
    }
    return this.snapshot();
  }

  async recordVisit({ url, title }) {
    const entry = cleanEntry({ url, title, visitedAt: Date.now() });
    if (!entry) return false;
    const latest = this.data.history[0];
    if (latest && latest.url === entry.url && entry.visitedAt - latest.visitedAt < 3000) {
      latest.title = entry.title;
      latest.visitedAt = entry.visitedAt;
    } else {
      this.data.history.unshift(entry);
    }
    this.data.history = this.data.history.slice(0, this.maxHistory);
    await this._persistQueued();
    return true;
  }

  async addBookmark({ url, title }) {
    const entry = cleanEntry({ url, title, visitedAt: Date.now() });
    if (!entry) throw new Error("Only HTTP(S) pages without embedded credentials can be bookmarked.");
    const existing = this.data.bookmarks.find(item => item.url === entry.url);
    if (existing) {
      existing.title = entry.title;
    } else {
      this.data.bookmarks.unshift(entry);
    }
    this.data.bookmarks = this.data.bookmarks.slice(0, this.maxBookmarks);
    await this._persistQueued();
    return this.getBookmarks();
  }

  async removeBookmark(url) {
    const safeUrl = safeHttpUrl(url);
    const before = this.data.bookmarks.length;
    this.data.bookmarks = this.data.bookmarks.filter(item => item.url !== safeUrl);
    if (before !== this.data.bookmarks.length) await this._persistQueued();
    return before !== this.data.bookmarks.length;
  }

  async clearHistory() {
    this.data.history = [];
    await this._persistQueued();
  }

  async clearHistory() {
    this.data.history = [];
    await this._persistQueued();
  }

  getHistory(limit = 50) {
    const count = Number.isInteger(limit) ? Math.max(0, Math.min(limit, this.maxHistory)) : 50;
    return this.data.history.slice(0, count).map(entry => ({ ...entry }));
  }

  getBookmarks() {
    return this.data.bookmarks.map(entry => ({ ...entry }));
  }

  snapshot() {
    return { version: 1, history: this.getHistory(this.maxHistory), bookmarks: this.getBookmarks() };
  }

  async _persistQueued() {
    this._writeQueue = this._writeQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = this.filePath + "." + process.pid + ".tmp";
      await fs.writeFile(temporaryPath, JSON.stringify(this.data, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporaryPath, this.filePath);
    });
    await this._writeQueue;
  }
}

module.exports = { BrowserDataStore, safeHttpUrl };
