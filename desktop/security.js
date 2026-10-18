"use strict";

function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw new Error("Enter a valid URL.");
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = "https://" + value;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid URL."); }
  if (!["http:","https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Only public HTTP(S) URLs without embedded credentials are allowed.");
  return parsed.href;
}
function isPrivateHost(hostname) {
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host==="metadata.google.internal"||host==="::1"||host==="::") return true;
  const parts=host.split(".").map(Number);
  if(parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)){const [a,b]=parts;return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;}
  return host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe80:");
}
function isAllowedNavigation(raw) {
  try { const url=new URL(raw); return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password; } catch { return false; }
}
function isAllowedModelEndpoint(raw) {
  try { const url=new URL(raw); if(!["http:","https:"].includes(url.protocol)||url.username||url.password) return false; if(url.protocol==="https:") return true; return ["localhost","127.0.0.1","::1"].includes(url.hostname.replace(/^\[|\]$/g,"")); } catch { return false; }
}
module.exports={normalizeUrl,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost};
