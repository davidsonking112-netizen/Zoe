"use strict";

const CONSEQUENTIAL_WORDS = /\b(pay|payment|purchase|buy|delete|remove|transfer|send|submit|publish|confirm|order|checkout|unsubscribe|cancel account|change password|change email|invite|share|revoke|withdraw|place bid)\b/i;
const SENSITIVE_INPUT_TYPES = new Set(["password", "file", "date", "datetime-local", "month", "week", "time"]);
const SENSITIVE_AUTOCOMPLETE = /(?:cc-|current-password|new-password|one-time-code|transaction-amount|transaction-currency)/i;

function isSensitiveElement(element) {
  if (!element || typeof element !== "object") return false;
  if (SENSITIVE_INPUT_TYPES.has(String(element.type || "").toLowerCase())) return true;
  return SENSITIVE_AUTOCOMPLETE.test(String(element.autocomplete || ""));
}

function requiresHumanApproval(action, element) {
  if (!action || typeof action !== "object") return true;
  if (action.type === "fill" && isSensitiveElement(element)) return true;
  if (action.type !== "click") return false;
  const label = String(element?.name || "");
  const type = String(element?.type || "").toLowerCase();
  const role = String(element?.role || "").toLowerCase();
  const isSubmitControl = type === "submit" || element?.formSubmit === true;
  const consequentialLabel = CONSEQUENTIAL_WORDS.test(label);
  const consequentialDestination = Boolean(element?.href && /(?:checkout|payment|purchase|delete|remove|unsubscribe|transfer|confirm|submit|order)/i.test(element.href));
  return isSubmitControl || consequentialLabel || consequentialDestination || (role === "button" && /\b(save changes|update account|place order|complete purchase)\b/i.test(label));
}

module.exports = { isSensitiveElement, requiresHumanApproval };
