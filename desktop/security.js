"use strict";

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
  return normalizeUrl(value);
}

function isPrivateHost(hostname) {
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
  if (host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host==="metadata.google.internal"||host==="::1"||host==="::") return true;
  const parts=host.split(".").map(Number);
  if(parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)){const [a,b]=parts;return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;}
  // Block IPv6 unique-local, link-local, multicast, documentation, and IPv4-mapped addresses.
  if (/^(?:fc|fd)[0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host) || /^ff[0-9a-f]{2}:/.test(host) || host.startsWith("2001:db8:")) return true;
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice(7);
    if (mapped.includes(".")) return isPrivateHost(mapped);
    const groups = mapped.split(":").filter(Boolean);
    if (groups.length >= 2) {
      const first = Number.parseInt(groups.at(-2),16), second = Number.parseInt(groups.at(-1),16);
      if (Number.isFinite(first)&&Number.isFinite(second)) return isPrivateHost([first>>8,first&255,second>>8,second&255].join("."));
    }
  }
  return false;
}

function isAllowedNavigation(raw) {
  try { const url=new URL(raw); return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password; } catch { return false; }
}
function isAllowedModelEndpoint(raw) {
  try { const url=new URL(raw); if(!["http:","https:"].includes(url.protocol)||url.username||url.password) return false; if(url.protocol==="https:") return true; return ["localhost","127.0.0.1","::1"].includes(url.hostname.replace(/^\[|\]$/g,"")); } catch { return false; }
}
function actionRequiresApproval({type, name="", elementType="", inputType="", placeholder=""}) {
  const description = `${name} ${placeholder}`.trim();
  if (type === "click") return elementType.toLowerCase() === "submit" || CONSEQUENTIAL_CLICK.test(description);
  if (type === "fill") return inputType.toLowerCase() === "password" || SENSITIVE_FIELD.test(description);
  return false;
}

module.exports={normalizeUrl,resolveAddressInput,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost,actionRequiresApproval};
