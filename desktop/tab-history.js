"use strict";

function rememberClosedTab(history, entry, limit = 20) {
  if (!Array.isArray(history) || !entry || typeof entry.url !== "string" ||
      !Number.isInteger(limit) || limit < 1) return false;
  let url;
  try { url = new URL(entry.url); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  history.push({
    url: url.href,
    title: typeof entry.title === "string" ? entry.title.slice(0, 300) : url.href
  });
  if (history.length > limit) history.splice(0, history.length - limit);
  return true;
}

function takeClosedTab(history) {
  if (!Array.isArray(history) || !history.length) return null;
  return history.pop() || null;
}

module.exports = { rememberClosedTab, takeClosedTab };
