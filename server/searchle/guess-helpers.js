// ===== Guess normalizers (HangStream port) =====
// Extracted verbatim from wt-eco searchle/server/guess-processor.js —
// plural → singular and British → American spelling normalization.
// Depends only on ./ranking-engine (vocab sets), which must be initialized
// first.

const rankingEngine = require('./ranking-engine');

// ---------------------------------------------------------------------------
// Plural → Singular Normalization
// ---------------------------------------------------------------------------

// Words that must NOT be singularized despite matching plural suffixes.
// Plurale tantum (always-plural nouns), mass/uncountable nouns, and words
// where the -s/-es ending is part of the root word — not a plural suffix.
const SINGULAR_EXCLUDE = new Set([
  // Plurale tantum — nouns that only exist in plural form
  'barracks', 'bellows', 'binoculars', 'boxers', 'briefs',
  'chaps', 'clothes', 'corps', 'credentials', 'customs',
  'dregs', 'dungarees', 'forceps', 'gallows', 'glasses',
  'goggles', 'goods', 'headquarters', 'jeans', 'knickers',
  'leggings', 'manners', 'narrows', 'overalls', 'pajamas',
  'pants', 'pliers', 'premises', 'proceeds', 'remains',
  'scissors', 'shears', 'shorts', 'slacks', 'suds',
  'surroundings', 'suspenders', 'tights', 'tongs', 'trousers',
  'tweezers', 'underpants',

  // Mass/uncountable nouns ending in -s
  'measles', 'molasses', 'mumps', 'news', 'shingles',

  // Same form singular and plural
  'series', 'species',

  // Words where -s/-es is part of the root, not a plural suffix
  'atlas', 'chaos', 'cosmos', 'diabetes', 'ethos',
  'herpes', 'kudos', 'lens', 'pathos', 'thermos',

  // Food/dish names commonly used in plural form
  'grits', 'nachos', 'oats',

  // Academic fields / disciplines (-ics is the base form, not plural)
  'athletics', 'diagnostics', 'dynamics', 'economics', 'electronics',
  'ethics', 'genetics', 'gymnastics', 'linguistics', 'logistics',
  'mathematics', 'mechanics', 'physics', 'politics', 'statistics',
  'tactics', 'therapeutics',

  // Adverbs, pronouns, prepositions, verbs — -s/-es is part of the word
  'across', 'always', 'besides', 'does', 'furthermore', 'goes',
  'nonetheless', 'overseas', 'perhaps', 'sometimes', 'themselves',
  'thus', 'upstairs', 'downstairs', 'towards', 'whereas',
  'crossroads',
]);

function bestCandidate(candidates) {
  let best = null;
  let bestIdx = Infinity;
  const allModels = rankingEngine.getAllModels();
  for (const word of candidates) {
    for (const model of allModels) {
      const idx = model.wordIndex.get(word);
      if (idx !== undefined && idx < bestIdx) {
        bestIdx = idx;
        best = word;
      }
    }
  }
  return best;
}

function toSingular(word) {
  const vocabSet = rankingEngine.getActiveVocabSet();
  if (word.length < 4) return word;
  if (SINGULAR_EXCLUDE.has(word)) return word;

  // -ies → -y (babies → baby, puppies → puppy)
  if (word.endsWith('ies') && word.length >= 5) {
    const s = word.slice(0, -3) + 'y';
    if (vocabSet.has(s)) return s;
  }

  // -ves → try -f, -fe, and verb base -ve (knives→knife, gives→give)
  if (word.endsWith('ves') && word.length >= 5) {
    const candidates = [];
    const sf = word.slice(0, -3) + 'f';
    const sfe = word.slice(0, -3) + 'fe';
    const sve = word.slice(0, -1); // verb base: gives→give, knives→knive
    if (vocabSet.has(sf)) candidates.push(sf);
    if (vocabSet.has(sfe)) candidates.push(sfe);
    if (vocabSet.has(sve)) candidates.push(sve);
    if (candidates.length > 0) return bestCandidate(candidates);
  }

  // -es → English plural rule is asymmetric:
  //   stems ending in s/sh/ch/x/z take -es  (box → boxes, wish → wishes)
  //   every other -e word just adds -s      (pore → pores, case → cases)
  if (word.endsWith('es') && word.length >= 5) {
    const withoutS = word.slice(0, -1);
    const withoutEs = word.slice(0, -2);
    const stemNeedsE = /(s|sh|ch|x|z)$/i.test(withoutEs);
    if (stemNeedsE) {
      if (vocabSet.has(withoutEs)) return withoutEs;
    } else {
      if (vocabSet.has(withoutS)) return withoutS;
    }
  }

  // -s (but not -ss, -us, -is) → remove s
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    const s = word.slice(0, -1);
    if (vocabSet.has(s)) return s;
  }

  return word;
}

// ---------------------------------------------------------------------------
// British → American Spelling Normalization
// ---------------------------------------------------------------------------
const BRITISH_TO_AMERICAN = {
  grey: 'gray',
  tyre: 'tire', tyres: 'tires',
  aluminium: 'aluminum',
  jewellery: 'jewelry',
  kerb: 'curb',
  draught: 'draft',
  plough: 'plow',
  gaol: 'jail',
  storey: 'story',
  maths: 'math',
  orientate: 'orient',
  whilst: 'while',
  amongst: 'among',
  towards: 'toward',
  afterwards: 'afterward',
  forwards: 'forward',
  backwards: 'backward',
  upwards: 'upward',
  downwards: 'downward',
  outwards: 'outward',
  inwards: 'inward',
  cosy: 'cozy',
  cheque: 'check',
  catalogue: 'catalog',
  dialogue: 'dialog',
  prologue: 'prolog',
  analogue: 'analog',
  monologue: 'monolog',
  epilogue: 'epilog',
  skilful: 'skillful',
  wilful: 'willful',
  fulfilment: 'fulfillment',
  enrolment: 'enrollment',
  instalment: 'installment',
  fulfil: 'fulfill',
  enrol: 'enroll',
  distil: 'distill',
  enthral: 'enthrall',
  appal: 'appall',
  licence: 'license',
  practise: 'practice',
  pretence: 'pretense',
  offence: 'offense',
  defence: 'defense',
  metre: 'meter',
  litre: 'liter',
  centre: 'center',
  fibre: 'fiber',
  lustre: 'luster',
  theatre: 'theater',
  sabre: 'saber',
  sombre: 'somber',
  spectre: 'specter',
  calibre: 'caliber',
  manoeuvre: 'maneuver',
  oestrogen: 'estrogen',
  paediatric: 'pediatric',
  anaemia: 'anemia',
  anaesthetic: 'anesthetic',
  foetus: 'fetus',
  diarrhoea: 'diarrhea',
  haemorrhage: 'hemorrhage',
  leukaemia: 'leukemia',
  oesophagus: 'esophagus',
  encyclopaedia: 'encyclopedia',
  mediaeval: 'medieval',
  aeroplane: 'airplane',
  sulphur: 'sulfur',
  pyjamas: 'pajamas',
  sceptic: 'skeptic',
  moustache: 'mustache',
  artefact: 'artifact',
  behove: 'behoove',
  connexion: 'connection',
};

const OUR_EXCLUDE = new Set([
  'four', 'pour', 'your', 'tour', 'dour', 'sour', 'hour',
  'contour', 'detour', 'velour', 'glamour',
  'flour', 'scour', 'devour', 'amour', 'tambour', 'troubadour',
]);

const ISE_EXCLUDE = new Set([
  'advise', 'comprise', 'compromise', 'supervise', 'surprise', 'exercise',
  'improvise', 'revise', 'devise', 'demise', 'franchise', 'merchandise',
  'enterprise', 'disguise', 'surmise', 'excise', 'incise', 'circumcise',
  'concise', 'precise', 'premise', 'promise', 'otherwise', 'likewise',
  'clockwise', 'paradise', 'arise', 'praise', 'raise', 'cruise', 'bruise',
  'poise', 'noise', 'guise', 'reprise', 'wise'
]);

const DOUBLE_L_EXCLUDE = new Set([
  'dwelling', 'spelling', 'smelling', 'yelling', 'telling', 'selling',
  'compelling', 'propelling', 'repelling', 'quelling', 'swelling', 'shelling',
  'excelling', 'felling', 'belling', 'welling', 'knelling'
]);

function toAmerican(word) {
  const vocabSet = rankingEngine.getActiveVocabSet();

  // 1. Explicit irregular mapping
  if (BRITISH_TO_AMERICAN[word]) {
    const am = BRITISH_TO_AMERICAN[word];
    if (vocabSet.has(am)) return am;
  }

  // 2. -our → -or (colour → color)
  if (word.endsWith('our') && word.length >= 5 && !OUR_EXCLUDE.has(word)) {
    const am = word.slice(0, -3) + 'or';
    if (vocabSet.has(am)) return am;
  }

  // 3. -isation → -ization (organisation → organization) — before -ise rule
  if (word.endsWith('isation')) {
    const am = word.slice(0, -7) + 'ization';
    if (vocabSet.has(am)) return am;
  }

  // 4. -ise → -ize (realise → realize)
  if (word.endsWith('ise') && word.length >= 5 && !ISE_EXCLUDE.has(word)) {
    const am = word.slice(0, -3) + 'ize';
    if (vocabSet.has(am)) return am;
  }

  // 5. -yse → -yze (analyse → analyze)
  if (word.endsWith('yse')) {
    const am = word.slice(0, -3) + 'yze';
    if (vocabSet.has(am)) return am;
  }

  // 6. -elling → -eling / -elled → -eled (travelling → traveling)
  if ((word.endsWith('elling') || word.endsWith('elled')) && !DOUBLE_L_EXCLUDE.has(word)) {
    const am = word.replace(/ll(ing|ed)$/, 'l$1');
    if (vocabSet.has(am)) return am;
  }

  return word;
}

// Canonical form used for ranking lookup: singularize, then Americanize.
function normalizeWord(word) {
  return toAmerican(toSingular(word));
}

module.exports = { toSingular, toAmerican, normalizeWord };
