"use strict";

const path = require("node:path");

const { lookup } = require("node:dns/promises");
const { isIP } = require("node:net");

const CONSEQUENTIAL_CLICK = /\b(pay(?:ment)?|purchase|buy|delete|remove|transfer|send|submit|publish|confirm|order|checkout|unsubscribe|cancel(?: account)?|sign out|log out|change password|invite|share|post|message|place bid|subscribe|withdraw|refund)\b/i;
const SENSITIVE_FIELD = /\b(password|passcode|one[- ]time code|verification code|otp|security code|cvv|cvc|card number|credit card|bank account|routing number|recovery code|secret key)\b/i;

function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw new Error("Enter a valid URL.");
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = "https://" + value;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid URL."); }
  if (!["http:","https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Only public HTTP(S) URLs without embedded credentials are allowed.");
  return parsed.href;
}

/**
 * Interpret ordinary address-bar input as either a URL or a search query.
 * Explicit schemes are preserved and ambiguous plain text goes to web search.
 */
function resolveAddressInput(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw new Error("Enter a URL or search query.");
  const value = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return normalizeUrl(value);
  const hostLike = /^(?:localhost|(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(?::\d{1,5})?(?:[/?#]\S*)?$/i.test(value);
  if (!hostLike || /\s/.test(value)) {
    return "https://www.google.com/search?q=" + encodeURIComponent(value);
  }
  const candidate = new URL("https://" + value);
  if (isPrivateHost(candidate.hostname)) return new URL("http://" + value).href;
  return normalizeUrl(value);
}

function parseIpv6Groups(host) {
  let value = host.toLowerCase();
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const octets = value.slice(separator + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, separator + 1) + high + ":" + low;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map(part => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups : null;
}

function isPrivateHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/^\\[|\\]$/g, "").replace(/\\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host === "metadata.google.internal") return true;

  if (isIP(host) === 4) {
    const octets = host.split(".").map(Number);
    const [a, b, c] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a === 255;
  }

  if (isIP(host) === 6) {
    const groups = parseIpv6Groups(host);
    if (!groups) return true;
    const [a, b, , , , f, g, h] = groups;
    const zeroPrefix = groups.slice(0, 6).every(group => group === 0);
    if (groups.every(group => group === 0) ||
        (groups.slice(0, 7).every(group => group === 0) && h === 1)) return true;
    // IPv4-mapped and deprecated IPv4-compatible IPv6 addresses inherit the embedded IPv4 policy.
    if (groups.slice(0, 5).every(group => group === 0) && f === 0xffff) {
      return isPrivateHost([g >> 8, g & 255, h >> 8, h & 255].join("."));
    }
    if (zeroPrefix) return isPrivateHost([g >> 8, g & 255, h >> 8, h & 255].join("."));
    // Only global-unicast IPv6 is eligible; reject special-use and transition ranges.
    if (a < 0x2000 || a > 0x3fff) return true;
    if (a === 0x2001 && b <= 0x01ff) return true; // IETF protocol assignments (2001::/23)
    if (a === 0x2001 && b === 0x0db8) return true; // documentation (2001:db8::/32)
    if (a === 0x2002) return true; // 6to4 can encapsulate arbitrary IPv4 destinations
    if (a === 0x3fff && b <= 0x0fff) return true; // documentation (3fff::/20)
    return false;
  }
  return false;
}

function redactSensitiveUrl(raw) {
  try {
    const url = new URL(raw);
    const sensitiveKey = /(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|passwd|auth|session|credential|api[_-]?key|signature|jwt|one[-_]?time[-_]?code|verification[-_]?code|^code$|^otp$|email|phone|ssn|card(?:number)?|cvv)/i;
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKey.test(key)) url.searchParams.set(key, "[redacted]");
    }
    if (/(?:access[_-]?token|refresh[_-]?token|id[_-]?token|auth|session|secret|password|jwt|code)=/i.test(url.hash)) {
      url.hash = "#[redacted]";
    }
    return url.href;
  } catch {
    return String(raw || "");
  }
}

async function assertPublicHttpUrl(raw, lookupAll = lookup) {
  const url = normalizeUrl(raw);
  if (!isAllowedNavigation(url)) throw new Error("Only HTTP(S) destinations are allowed.");
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(hostname)) throw new Error("AI navigation is limited to public HTTP(S) destinations.");
  if (isIP(hostname)) return url;
  let addresses;
  try {
    addresses = await lookupAll(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("AI navigation was blocked because Zoe could not verify that the destination is public.");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateHost(address))) {
    throw new Error("AI navigation was blocked because the destination resolves to a private or reserved network.");
  }
  return url;
}

function isAllowedNavigation(raw) {
  try { const url=new URL(raw); return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password; } catch { return false; }
}
function isAllowedModelEndpoint(raw) {
  try { const url=new URL(raw); if(!["http:","https:"].includes(url.protocol)||url.username||url.password) return false; if(url.protocol==="https:") return true; return ["localhost","127.0.0.1","::1"].includes(url.hostname.replace(/^\[|\]$/g,"")); } catch { return false; }
}
function sanitizeDownloadFilename(rawFilename) {
  const raw = typeof rawFilename === "string" ? rawFilename : "";
  const filename = path.basename(raw).replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_") || "download";
  return filename === "." || filename === ".." ? "download" : filename;
}

function allocateDownloadPath(downloadsDirectory, rawFilename, existsFn = () => false, reservedPaths = new Set()) {
  const filename = sanitizeDownloadFilename(rawFilename);
  const parsed = path.parse(filename);
  let destination = path.join(downloadsDirectory, filename);
  let suffix = 1;
  while (existsFn(destination) || reservedPaths.has(destination)) {
    destination = path.join(downloadsDirectory, parsed.name + " (" + suffix++ + ")" + parsed.ext);
  }
  reservedPaths.add(destination);
  return { filename, destination };
}

function actionRequiresApproval({type, name="", elementType="", inputType="", placeholder="", autocomplete="", href="", formSubmit=false, role=""}) {
  const description = `${name} ${placeholder} ${autocomplete}`.trim();
  if (type === "click") {
    const consequentialDestination = /(?:checkout|payment|purchase|delete|remove|unsubscribe|transfer|confirm|submit|order|withdraw)/i.test(String(href));
    const consequentialButton = /^(?:button)$/i.test(String(role)) && /\b(save changes|update account|place order|complete purchase)\b/i.test(String(name));
    return elementType.toLowerCase() === "submit" || formSubmit === true || CONSEQUENTIAL_CLICK.test(description) || consequentialDestination || consequentialButton;
  }
  if (type === "fill") {
    const sensitiveType = ["password", "file", "date", "datetime-local", "month", "week", "time"].includes(inputType.toLowerCase());
    return sensitiveType || SENSITIVE_FIELD.test(description) ||
      /(?:cc-|current-password|new-password|one-time-code|transaction-amount|transaction-currency)/i.test(String(autocomplete));
  }
  return true;
}

module.exports={normalizeUrl,resolveAddressInput,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost,actionRequiresApproval,assertPublicHttpUrl,redactSensitiveUrl,sanitizeDownloadFilename,allocateDownloadPath};
