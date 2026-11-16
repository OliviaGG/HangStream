'use strict';
/**
 * pookie-filter.js - pre-payment moderation for Pookie Tok messages.
 *
 * Paid viewer text appears on the LIVE TikTok stream, so this REJECTS (does not
 * censor) anything unsafe BEFORE the viewer can pay - which is why no refunds
 * are ever needed for blocked content. It reuses chat-filter's blocklist
 * (homoglyph / leetspeak / zalgo aware) and adds link, contact-info, and length
 * rules. The server re-runs validate() on the webhook path as defense in depth.
 *
 *   validate(text, maxChars) -> { ok: true, cleaned } | { ok: false, reason }
 */

const chatFilter = require('./chat-filter');

const URL_RE = /(https?:\/\/|www\.)\S+/i;
// domain-like tokens (catches "join my.shop" style link-dodging without a scheme)
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(com|net|org|io|gg|tv|co|me|xyz|link|shop|store|onlyfans|info|biz|live|app|site|club|fun|cc)\b/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RE = /(?:\+?\d[\s().-]?){7,}\d/;
// zero-width + combining (zalgo) marks - built from an ASCII escape string
const ZALGO_RE = new RegExp('[\\u0300-\\u036f\\u0489\\u200b-\\u200f\\u2028-\\u202f\\uFEFF]', 'g');

function cleanText(text) {
  return String(text || '')
    .replace(ZALGO_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validate(text, maxChars) {
  const cleaned = cleanText(text);
  const cap = Number(maxChars) > 0 ? Number(maxChars) : 200;

  if (!cleaned) return { ok: false, reason: 'Please enter a message.' };
  if (cleaned.length > cap) return { ok: false, reason: 'Too long - keep it to ' + cap + ' characters.' };
  if (URL_RE.test(cleaned) || DOMAIN_RE.test(cleaned)) return { ok: false, reason: "Links aren't allowed." };
  if (EMAIL_RE.test(cleaned)) return { ok: false, reason: "Please don't include email addresses." };
  if (PHONE_RE.test(cleaned)) return { ok: false, reason: "Please don't include phone numbers." };
  if (chatFilter.containsBlockedWord(cleaned)) return { ok: false, reason: "Please keep it friendly - that wording isn't allowed." };

  return { ok: true, cleaned };
}

// Display names are shorter and shown next to the message; same rules, tight cap.
function validateName(name) {
  const cleaned = cleanText(name);
  if (!cleaned) return { ok: true, cleaned: '' }; // name is optional
  if (cleaned.length > 24) return { ok: false, reason: 'Name is too long (max 24).' };
  if (URL_RE.test(cleaned) || DOMAIN_RE.test(cleaned) || EMAIL_RE.test(cleaned)) {
    return { ok: false, reason: "Name can't contain links or emails." };
  }
  if (chatFilter.containsBlockedWord(cleaned)) return { ok: false, reason: "Please pick a friendlier name." };
  return { ok: true, cleaned };
}

module.exports = { validate, validateName };
