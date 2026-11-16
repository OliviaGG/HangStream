// rank-target-tiering.js — shared title-word ordering helper.
//
// Used by WikiSearchle, WikiRecTangled, and (potentially) any future
// game that rotates a `rankTarget` through a title's content words. The
// order of that rotation shapes how rich the article context is by the
// time players have to guess each word.
//
// 4-tier system, easiest first:
//
//   Tier 1: low-polysemy common nouns (e.g. "salmon")     — rank FIRST
//   Tier 2: adjectives, gerunds, mixed-POS but focused    — rank middle
//   Tier 3: polysemous / verb-dominant common words       — defer
//           (e.g. "set", "run", "bank", "lead" — these have dozens of
//            unrelated senses, so player guesses produce noisy scoring;
//            title-word games should still require them, just later)
//   Tier 4: proper nouns (capitalized; "Hastings", "Pollock") — rank LAST
//           (sparse semantic neighborhood, only guessable from context)
//
// Two data sources, both lazy-loaded with graceful fallback:
//
//   A. Word-bank Zipf frequency  — data/word-bank/frequency.json
//      A capitalized word with Zipf < 3.5 is almost certainly a name.
//      Plurals fall back to singular Zipf so "indictments" (3.04)
//      inherits "indictment" (3.70).
//
//   B. WordNet 3.0 POS sense counts — data/word-bank/wordnet-pos.json
//      Distinguishes salmon (5 senses, noun-dominant) from set (45
//      senses, verb-dominant) without a hand-curated polysemy list.
//      Built from Princeton's WNdb-3.0; ~1.6 MB, ~83k words.
//
// If either file is missing the helper degrades gracefully — never
// throws. Capitalization-only fallback approximates the original
// pre-tiering behavior.
//
// Migration history:
//   - Built inline in /opt/wikisearchle/server.js (2026-05-10)
//   - Copied into /opt/wikirectangled/src/ (same day)
//   - Extracted here as shared module (2026-05-10) — see ContextKeep
//     memory `wordbank_wordnet_consolidation` and the sibling
//     `*_rank_target_tiering` memos.

const fs = require('fs');
const path = require('path');

// Small built-in STOPLIST — function words that should be skipped when
// scoring tier. Callers usually pre-filter `baseOrder` so this is a
// defensive guard. Kept short on purpose (covers the words every English
// title parser strips). If a game has its own broader stoplist, the
// extra words simply won't appear in baseOrder and so won't be tiered.
const STOPLIST = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at',
  'to', 'for', 'with', 'by', 'as', 'from', 'is', 'are', 'was',
  'were', 'be', 'it', 'its', 'this', 'that',
  'all', 'both', 'each', 'every', 'some', 'any', 'no', 'not',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'they', 'them', 'their', 'theirs',
]);

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Data-file loaders. Both look in data/word-bank/ relative to this
// module's location — the canonical home. If you're running this in
// dev and your chat-relay checkout doesn't include word-bank assets
// (they're prod-only on most setups), the helper degrades gracefully.
const DATA_DIR = path.join(__dirname, '..', 'data', 'word-bank');

let _wordnetPos = null;
let _wordnetTried = false;
function _getWordnetPos() {
  if (_wordnetTried) return _wordnetPos;
  _wordnetTried = true;
  const p = path.join(DATA_DIR, 'wordnet-pos.json');
  try {
    _wordnetPos = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`[Tiering] Loaded WordNet POS: ${Object.keys(_wordnetPos).length} words from ${p}`);
  } catch (e) {
    console.warn(`[Tiering] WordNet POS unavailable at ${p} (${e.code || e.message}); rank-target tiering falls back to capitalization-only.`);
    _wordnetPos = null;
  }
  return _wordnetPos;
}

let _frequency = null;
let _frequencyTried = false;
function _getFrequency() {
  if (_frequencyTried) return _frequency;
  _frequencyTried = true;
  const p = path.join(DATA_DIR, 'frequency.json');
  try {
    _frequency = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`[Tiering] Loaded frequency: ${Object.keys(_frequency).length} words from ${p}`);
  } catch (e) {
    console.warn(`[Tiering] frequency.json unavailable at ${p} (${e.code || e.message}); skipping Zipf-based proper-noun screening.`);
    _frequency = null;
  }
  return _frequency;
}

function _wnLookup(norm) {
  const wn = _getWordnetPos();
  if (!wn) return null;
  let entry = wn[norm];
  // Plural fallback (witches -> witch, bodies -> body, indictments -> indictment).
  for (const cand of _singularCandidates(norm)) {
    if (entry) break;
    entry = wn[cand];
  }
  return entry || null;
}

function _singularCandidates(norm) {
  const out = [];
  if (norm.endsWith('ies') && norm.length > 4) out.push(norm.slice(0, -3) + 'y');
  if (norm.endsWith('es') && norm.length > 4) out.push(norm.slice(0, -2));
  if (norm.endsWith('s') && norm.length > 3) out.push(norm.slice(0, -1));
  return out;
}

function _zipf(norm) {
  const f = _getFrequency();
  if (!f) return 5; // assume "common" when corpus missing — never falsely flag
  const z = f[norm] || 0;
  // Plurals are artificially less frequent than their singulars. Return
  // the max so e.g. "witches" inherits "witch" and "indictments"
  // inherits "indictment" for proper-noun screening.
  return Math.max(z, ..._singularCandidates(norm).map((cand) => f[cand] || 0));
}

// rankTargetTier returns a tier number 1..4 for a single title word, or
// null if the word should be skipped (empty / stopword). rawWord must be
// in its original Wikipedia casing.
function rankTargetTier(rawWord, isFirstWord, otherCapitalized) {
  const norm = normalize(rawWord);
  if (!norm || STOPLIST.has(norm)) return null;

  const isCap = /^[A-ZÀ-Ý]/.test(String(rawWord));
  // A capitalized word "could be" a proper noun unless it's just sentence
  // case (capitalized first word of an otherwise lowercase title).
  const couldBeProper = isCap && (!isFirstWord || otherCapitalized);

  const entry = _wnLookup(norm);
  const zipf = _zipf(norm);

  // Tier 4 — proper-noun screening for capitalized words. Two strong
  // signals; either triggers T4:
  //   - rare in the everyday corpus (Zipf < 3.5)
  //   - not in WordNet at all (after singular-s fallback)
  if (couldBeProper) {
    if (zipf < 3.5) return 4;
    if (!entry) return 4;
    // else trust frequency + WordNet-presence; fall through.
  }

  if (entry) {
    const n = entry.n || 0;
    const v = entry.v || 0;
    const a = entry.a || 0;
    const r = entry.r || 0;
    const total = n + v + a + r;

    // Tier 3 — highly polysemous (≥ 15 senses across POS) or verb-dominant.
    if (total >= 15) return 3;
    if (v > 0 && v >= n && v >= a) return 3;

    // Tier 1 — clear noun-dominant, low polysemy.
    if (n >= 2 && n >= v * 2 && n >= a && total <= 8) return 1;
  }

  // Tier 2 — everything else.
  return 2;
}

// Reorder a list of title-word norms by rank-target difficulty tier (low
// tier = rank first = easier to build context). Preserves original order
// within a tier (stable sort). Returns input unchanged when all words
// share the same tier (nothing to reorder).
//
//   baseOrder      — array of normalized title words (already stoplist-filtered)
//   titleWordsRaw  — array of original-casing title words from Wikipedia
//                    (may include stop words / non-placeable forms; we
//                    just use them for the capitalization heuristic)
function orderByRankTier(baseOrder, titleWordsRaw) {
  if (!Array.isArray(baseOrder) || baseOrder.length < 2) return baseOrder;
  if (!Array.isArray(titleWordsRaw) || titleWordsRaw.length === 0) return baseOrder;

  const isCap = (w) => typeof w === 'string' && /^[A-ZÀ-Ý]/.test(w);
  const otherCapitalized = titleWordsRaw
    .slice(1)
    .filter((w) => { const n = normalize(w); return n && !STOPLIST.has(n); })
    .some(isCap);

  const tierByNorm = new Map();
  titleWordsRaw.forEach((raw, idx) => {
    const norm = normalize(raw);
    if (!norm) return;
    const t = rankTargetTier(raw, idx === 0, otherCapitalized);
    if (t !== null) tierByNorm.set(norm, t);
  });

  // Bail out if every word landed in the same tier.
  const tiers = [...tierByNorm.values()];
  if (tiers.length < 2 || tiers.every((t) => t === tiers[0])) return baseOrder;

  return baseOrder.slice().sort((a, b) => {
    const ta = tierByNorm.has(a) ? tierByNorm.get(a) : 2;
    const tb = tierByNorm.has(b) ? tierByNorm.get(b) : 2;
    if (ta !== tb) return ta - tb;
    return baseOrder.indexOf(a) - baseOrder.indexOf(b);
  });
}

// ── Article-pool picker filter ────────────────────────────────────────
//
// `articlePassesEasyFilter(entry)` returns true if the article is suitable
// for an "easy round": all title content words are common nouns or
// adjectives/focused mixed-POS words (tiers 1 or 2), AND the title isn't
// a compound named entity per Wikipedia's shortdesc/categories metadata,
// AND the title doesn't carry a Wikipedia disambiguation parenthetical
// like "(2025 film)" / "(video game series)" / "(toy)" (those nearly
// always mark a proper-noun phrase the per-word tiering can't catch).
//
// Originally ported from WikiRec's article picker (per-word + compound
// named-entity checks). Lives here so any game can apply the same gate.
// See ContextKeep memory `wikisearchle_easy_article_filter`.

// Multi-token-compound named-entity regexes. Read at coverage build
// time by Chat Relay into entry.shortdesc + entry.categories.
const SHORTDESC_NAMED_PLACE_RE = new RegExp([
  '\\b(?:municipality|town|city|village|hamlet|borough|township|commune|civil parish|suburb|district|county|province|country|region|territory|reservation|prefecture) (?:in|of|near) [A-Z]',
  '\\b(?:river|lake|mountain|peak|range|ridge|valley|gorge|canyon|island|archipelago|peninsula|cape|bay|gulf|strait|desert|forest|glacier|volcano|crater|reef|atoll|waterfall) (?:in|of|near) [A-Z]',
  '\\b(?:skyscraper|cathedral|basilica|mosque|synagogue|monastery|abbey|palace|castle|fortress|stadium|arena|opera house|railway station|train station|metro station|subway station) (?:in|of|at|near) [A-Z]',
].join('|'));
const SHORTDESC_NAMED_ROLE_RE = new RegExp([
  '\\b(footballer|cricketer|cyclist|swimmer|boxer|wrestler|gymnast|skater|skier|surfer|golfer|sportsman|sportswoman|sportsperson|athletics competitor)\\b',
  '\\b(rugby (union |league )?(player|coach))\\b',
  '\\b(tennis|baseball|basketball|hockey|volleyball|football|soccer|handball|water polo|ice hockey|field hockey) (player|coach)\\b',
  '\\bolympic (gold|silver|bronze)?\\s*(medall?ist|champion|competitor|athlete)\\b',
  '\\b(actor|actress|singer|songwriter|musician|composer|guitarist|pianist|drummer|violinist|cellist|saxophonist|trumpeter|conductor|opera singer|rapper|record producer|film producer|film director|filmmaker|cinematographer|screenwriter|playwright|novelist|poet|essayist|biographer|memoirist|journalist|columnist|painter|sculptor|illustrator|cartoonist|photographer|fashion designer|graphic designer|industrial designer|architect|chef)\\b',
  '\\b(politician|statesman|stateswoman|diplomat|senator|congressman|congresswoman|governor|mayor|prime minister|monarch|emperor|empress|sultan|tsar|pharaoh|chieftain|admiral|brigadier|field marshal|bishop|cardinal|rabbi|imam|guru|martyr|prophet|jurist|barrister|solicitor|prosecutor)\\b',
  '\\b(scientist|physicist|chemist|biologist|botanist|zoologist|astronomer|mathematician|engineer|inventor|economist|sociologist|psychologist|psychiatrist|anthropologist|archaeologist|historian|linguist|philosopher|theologian)\\b',
  '\\b(activist|reformer|revolutionary|abolitionist|suffragist|explorer|navigator|aviator|astronaut|cosmonaut|mountaineer)\\b',
  '\\(\\s*\\d{3,4}\\s*[-–]\\s*\\d{0,4}\\s*\\)',
  '\\bborn\\s+\\d{3,4}\\b',
  '\\bdied\\s+\\d{3,4}\\b',
  '\\bborn\\s+in\\s+\\d{3,4}\\b',
  '\\b(state park|national park|national monument|national forest|national seashore|national wildlife refuge|national recreation area|national historic site|national historic park|protected area|provincial park|regional park|country park|county park|wildlife refuge|wildlife sanctuary|nature reserve|nature preserve|biosphere reserve|world heritage site|game reserve|marine park|marine reserve)\\b',
  '\\b(populated place|census-designated place|unincorporated community|former settlement|abandoned settlement|ghost town|electoral district|administrative division|administrative region|self-governing|sovereign state|landlocked country|island country|island nation|capital city)\\b',
].join('|'), 'i');
const CATEGORY_NAMED_ENTITY_RE = /(?:^|_)(?:living_people|\d{3,4}_births?|\d{3,4}_deaths?|footballers|cricketers|olympic_(?:athletes|gold_medalists|silver_medalists|bronze_medalists|medalists|competitors|champions)|baseball_players|basketball_players|tennis_players|hockey_players|rugby_(?:union_|league_)?(?:players|footballers)|boxers|cyclists|swimmers|skaters|skiers|surfers|gymnasts|wrestlers|golfers|sportsmen|sportswomen|actors|actresses|singers|musicians|composers|conductors|guitarists|pianists|drummers|rappers|songwriters|record_producers|film_producers|film_directors|filmmakers|screenwriters|playwrights|novelists|poets|writers|authors|journalists|painters|sculptors|illustrators|architects|photographers|designers|chefs|politicians|statesmen|monarchs|emperors|generals|admirals|saints|scientists|physicists|chemists|biologists|botanists|zoologists|astronomers|mathematicians|engineers|inventors|economists|sociologists|psychologists|anthropologists|archaeologists|historians|linguists|philosophers|theologians|judges|jurists|lawyers|activists|explorers|astronauts|state_parks(?:_of|_in)|national_parks(?:_of|_in)|national_monuments(?:_of|_in)|national_forests(?:_of|_in)|protected_areas(?:_of|_in)|wildlife_refuges(?:_of|_in)|nature_reserves(?:_of|_in)|cities_in|towns_in|villages_in|hamlets_in|boroughs_in|townships_in|counties_in|municipalities_in|settlements_in|populated_places_in|former_populated_places|former_settlements|ghost_towns_in|neighbou?rhoods_in|suburbs_of|rivers_of|rivers_in|lakes_of|lakes_in|mountains_of|mountains_in|peaks_of|islands_of|islands_in|forests_of|forests_in|reservoirs_in|reservoirs_of|stadiums_in|theatres_in|theaters_in|museums_in|universities_in|cathedrals_in|basilicas_in|temples_in|monasteries_in|abbeys_in|palaces_in|castles_in|forts_in|landmarks_in|monuments_in|memorials_in)(?:_|$)/i;

function looksLikeNamedEntity(entry) {
  const sd = entry && entry.shortdesc;
  if (typeof sd === 'string') {
    if (SHORTDESC_NAMED_ROLE_RE.test(sd)) return true;
    if (SHORTDESC_NAMED_PLACE_RE.test(sd)) return true;
  }
  const cats = entry && entry.categories;
  if (Array.isArray(cats)) {
    for (const c of cats) if (CATEGORY_NAMED_ENTITY_RE.test(String(c))) return true;
  }
  return false;
}

// Wikipedia disambiguation parentheticals — almost always mark a
// proper-noun phrase the per-word tiering can't catch by casing alone
// ("Kiss of the Spider Woman (2025 film)", "Marble (toy)", "Apple Inc.
// (technology company)"). Cheap heuristic: any "( ... )" tail.
const DISAMBIG_PAREN_RE = /\([^)]*\)/;

function hasDisambiguationParenthetical(entry) {
  const t = entry && entry.title;
  return typeof t === 'string' && DISAMBIG_PAREN_RE.test(t);
}

// Classify a coverage entry by the highest title-word tier (1..4) using
// the same rules orderByRankTier uses. Returns null if no usable words.
function highestTitleTier(entry) {
  const raws = String((entry && entry.title) || '').split(/\s+/).filter(Boolean);
  const norms = (entry && entry.titleWordNorms) || [];
  if (norms.length === 0) return null;
  const isCap = (w) => typeof w === 'string' && /^[A-ZÀ-Ý]/.test(w);
  const otherCapitalized = raws.slice(1)
    .filter((w) => { const n = normalize(w); return n && !STOPLIST.has(n); })
    .some(isCap);
  const tiers = norms.map((n) => {
    const rawIdx = raws.findIndex((r) => normalize(r) === n);
    const raw = rawIdx >= 0 ? raws[rawIdx] : n;
    return rankTargetTier(raw, rawIdx === 0, otherCapitalized);
  }).filter((t) => t !== null);
  if (tiers.length === 0) return null;
  return Math.max(...tiers);
}

// Picker filter: accept articles whose title is all-T1/T2 (common nouns
// + adjectives + focused mixed-POS), not a compound named entity, and
// not a Wikipedia disambiguation page. Rejects:
//   - any T3 title word (polysemous / verb-dominant — "Set theory")
//   - any T4 title word (proper noun — "Henry Pollock")
//   - compound named entities per shortdesc/categories regex
//   - disambiguation parentheticals like "(2025 film)"
//
// `entry` must have at least: title, titleWordNorms[]. shortdesc + categories
// are optional but improve compound-named-entity detection.
function articlePassesEasyFilter(entry) {
  if (!entry || !Array.isArray(entry.titleWordNorms) || entry.titleWordNorms.length === 0) return false;
  if (hasDisambiguationParenthetical(entry)) return false;
  if (looksLikeNamedEntity(entry)) return false;
  const maxTier = highestTitleTier(entry);
  if (maxTier === null) return false;
  return maxTier <= 2;
}

// Classify a coverage entry's title words into `findable` (T1/T2/T3 —
// playable player guess goals, with T3 deferred by orderByRankTier) and
// `skipped` (T4 proper-noun-ish words — hard to guess from context).
// Stopwords are excluded from both lists.
//
// Used by the "salvage-the-mixed-titles" picker variant: instead of
// rejecting "Battle of Hastings" outright because Hastings is T4, the
// round runs against `battle` (findable) and `Hastings` is treated as
// gameplay-invisible until round-end reveal. Polysemous T3 words remain
// findable so titles like "The Fellowship of the Ring" still require
// their important content words.
function classifyTitleWords(entry) {
  const raws = String((entry && entry.title) || '').split(/\s+/).filter(Boolean);
  const norms = (entry && entry.titleWordNorms) || [];
  const findable = [];
  const skipped = [];
  if (norms.length === 0) return { findable, skipped };
  const isCap = (w) => typeof w === 'string' && /^[A-ZÀ-Ý]/.test(w);
  const otherCapitalized = raws.slice(1)
    .filter((w) => { const n = normalize(w); return n && !STOPLIST.has(n); })
    .some(isCap);
  for (const n of norms) {
    const rawIdx = raws.findIndex((r) => normalize(r) === n);
    const raw = rawIdx >= 0 ? raws[rawIdx] : n;
    const t = rankTargetTier(raw, rawIdx === 0, otherCapitalized);
    if (t === null) continue;          // stopword — skip entirely
    if (t === 4) skipped.push(n);
    else findable.push(n);
  }
  return { findable, skipped };
}

// Looser picker filter: accept an article if it has AT LEAST ONE
// findable (T1/T2/T3) title word. Still rejects compound named entities
// and Wikipedia disambiguation parentheticals — those break the game
// regardless of how many findable words remain. T4 words in the title
// get gameplay-hidden via classifyTitleWords on the server side.
//
// Roughly doubles the eligible pool vs articlePassesEasyFilter while
// keeping the same anti-hard-round guarantees on rank target.
function articleHasAtLeastOneEasyTitleWord(entry) {
  if (!entry || !Array.isArray(entry.titleWordNorms) || entry.titleWordNorms.length === 0) return false;
  if (hasDisambiguationParenthetical(entry)) return false;
  if (looksLikeNamedEntity(entry)) return false;
  const { findable } = classifyTitleWords(entry);
  return findable.length > 0;
}

module.exports = {
  orderByRankTier,
  rankTargetTier,
  normalize,
  STOPLIST,
  articlePassesEasyFilter,
  articleHasAtLeastOneEasyTitleWord,
  classifyTitleWords,
  highestTitleTier,
  looksLikeNamedEntity,
  hasDisambiguationParenthetical,
  // Internal exports for tests / dev tooling — not part of the stable API.
  _internal: { _getWordnetPos, _getFrequency, _wnLookup, _zipf, _singularCandidates },
};
