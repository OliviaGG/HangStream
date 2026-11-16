#!/usr/bin/env node
/**
 * Bulk-patch all ad-vertical-*.html overlays to honor three winner cosmetics:
 *   - hero_badge → body background (existing behavior, preserved)
 *   - name_color → URL letter tones (NEW — replaces hero_badge-derived tones)
 *   - name_glow  → URL letter glow  (NEW — replaces auto-generated glow color)
 *
 * Previously, applyWinnerBadge() required hero_badge to be present and
 * derived the URL tones by extracting the dominant color from the badge
 * gradient. This patch makes all three cosmetics work INDEPENDENTLY:
 *   - Hero badge alone → background set, tones fall back to hero_badge color
 *     extraction (backward compatible).
 *   - Name color alone → background stays default, tones come from name_color.
 *   - Both → background from hero_badge, tones from name_color (name_color wins).
 *   - Name glow  → glow color overrides whatever else set it.
 *   - Nothing    → default navy theme.
 *
 * The patched applyWinnerBadge function is injected verbatim into every
 * ad-vertical-*.html file (currently 17 variants).
 *
 * Implementation details:
 *   - All 17 ad-vertical variants wrap their JS in an IIFE and use a
 *     hardcoded 2-space indent inside it. The script replaces the FULL
 *     line range of the existing applyWinnerBadge function (including its
 *     leading whitespace) with a freshly-indented 2-space version, so
 *     running the patch is idempotent even if a previous run left behind
 *     a broken indent.
 *   - Function boundaries are found via brace counting that respects
 *     strings, template literals, and comments, so edge cases like
 *     `{/}` or `}` inside string literals don't fool the parser.
 *   - Deploy notes: after running, the 17 HTML files need to be copied
 *     to the droplet and the chat-relay process does NOT need a restart
 *     (these are static files served by express.static).
 *
 * Usage:
 *   node scripts/patch-ad-overlays.js
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(PUBLIC_DIR)
  .filter(f => /^ad-vertical-.+\.html$/.test(f))
  .map(f => path.join(PUBLIC_DIR, f))
  .sort();

// Hardcoded — all ad-vertical variants use 2-space IIFE indent.
const INDENT = '  ';

// ── The new applyWinnerBadge function, with NO leading indent ────────
// Body lines use 2-space indent relative to the function. The INDENT
// prefix is prepended to every line at write time, so the final result
// has signature at INDENT (2 spaces) and body at INDENT+2 (4 spaces).
const NEW_FN_RAW = `function applyWinnerBadge(cosmetics) {
  if (!cosmetics) { resetToDefault(); return; }

  // Cosmetics may be flat (cosmetics.hero_badge) or wrapped (cosmetics.equipped.hero_badge).
  // Unwrap once so the rest of the function can read a single flat object.
  const cos = cosmetics.equipped || cosmetics;
  const badge = cos.hero_badge;
  const nameColor = cos.name_color;
  const nameGlow = cos.name_glow;

  // If none of the three supported cosmetics are present, go back to default.
  if (!badge && !nameColor && !nameGlow) { resetToDefault(); return; }

  // Start from a clean baseline so partial cosmetics don't inherit stale state.
  body.style.background = DEFAULT_BG;
  body.style.backgroundSize = '';
  body.style.animation = '';
  applyTones(DEFAULT_THEME);

  // ── 1. Hero badge → body background ─────────────────────────────────
  let badgeBg = null;
  if (badge) {
    badgeBg = badge.background || badge.css?.background;
    if (badgeBg) {
      body.style.background = badgeBg;
      const bgSize = badge.backgroundSize || badge.css?.backgroundSize;
      if (bgSize) body.style.backgroundSize = bgSize;
      const anim = badge.animation || badge.css?.animation;
      if (anim) body.style.animation = anim;
    }
  }

  // ── 2. Name color → URL letter tones ────────────────────────────────
  // name_color is authoritative for the URL letters. Only fall back to
  // extracting from the hero_badge gradient when name_color is absent.
  let tonesSource = null;
  if (nameColor && nameColor.color) {
    tonesSource = extractColor(nameColor.color);
  }
  if (!tonesSource && badgeBg) {
    tonesSource = extractColor(badgeBg);
  }
  if (tonesSource) {
    const norm = normalizeColor(tonesSource[0], tonesSource[1], tonesSource[2]);
    const tones = tonesFromColor(norm[0], norm[1], norm[2]);
    applyTones(tones);
  }

  // ── 3. Name glow → URL letter glow color ────────────────────────────
  // name_glow.textShadow is a CSS text-shadow declaration. We extract the
  // dominant color from it and use it as --glow-a so the existing blur/
  // offset structure is preserved but the glow color matches the winner.
  if (nameGlow && nameGlow.textShadow) {
    const glowRgb = extractColor(nameGlow.textShadow);
    if (glowRgb) {
      root.style.setProperty('--glow-a', 'rgba(' + glowRgb[0] + ',' + glowRgb[1] + ',' + glowRgb[2] + ',0.6)');
    }
  }

  // ── 4. Brief flash — only when we have a hero badge to flash ───────
  if (badgeBg) {
    const flash = document.getElementById('hero-flash');
    if (flash) {
      flash.style.background = badgeBg;
      const bgSize = badge.backgroundSize || badge.css?.backgroundSize;
      if (bgSize) flash.style.backgroundSize = bgSize;
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 4000);
    }
  }
}`;

// Apply 2-space indent to every line of the function block.
const NEW_FN_INDENTED = NEW_FN_RAW.split('\n').map(l => INDENT + l).join('\n');

// ── Brace-balanced function finder ──────────────────────────────────────
// Returns [lineStartIdx, endIdx) where:
//   lineStartIdx = start of the line containing the function signature
//                  (so the leading whitespace is included for replacement)
//   endIdx       = index just past the matching closing brace
function findFunctionLineRange(source, signature) {
  const sigIdx = source.indexOf(signature);
  if (sigIdx === -1) return null;
  const lineStart = source.lastIndexOf('\n', sigIdx) + 1;
  const openBrace = source.indexOf('{', sigIdx);
  if (openBrace === -1) return null;
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { return [lineStart, i + 1]; }
    }
  }
  return null;
}

let patched = 0;
let skipped = 0;
const failures = [];

for (const file of files) {
  const name = path.basename(file);
  const source = fs.readFileSync(file, 'utf8');
  const range = findFunctionLineRange(source, 'function applyWinnerBadge(cosmetics)');
  if (!range) {
    failures.push(name + ' (function not found)');
    continue;
  }
  const [lineStart, endIdx] = range;
  const next = source.slice(0, lineStart) + NEW_FN_INDENTED + source.slice(endIdx);
  if (next === source) {
    skipped++;
    continue;
  }
  fs.writeFileSync(file, next, 'utf8');
  patched++;
  console.log('  patched  ' + name);
}

console.log('');
console.log('Patched: ' + patched);
console.log('Skipped: ' + skipped + ' (already up-to-date)');
if (failures.length) {
  console.log('Failed:');
  failures.forEach(f => console.log('  ' + f));
  process.exit(1);
}
