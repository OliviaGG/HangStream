# Validated Wikipedia content expansion

The 2026-10-06 catalog adds 50 new articles to the canonical 35,393-entry coverage snapshot. All prior page entries are preserved exactly. [The manifest](../data/wikipedia-expansion-2026-10-06.json) records source revisions, annual views, clean-prose hashes, model membership, and successful public/solo grid proofs. [Candidate provenance](../data/wikipedia-expansion-candidates-2026-10-06.json) records source categories and curated priorities.

## Local importer

Run scripts/import-wikipedia-expansion.js with --coverage BASELINE.json --candidates CANDIDATES.json --wikirec-dir CANONICAL_WIKIREC_SNAPSHOT --relay-dir CANONICAL_RELAY_SNAPSHOT --membership SEARCHLE_MODEL_MEMBERSHIP.json --out-dir SEPARATE_STAGING_DIR. Optional --priority prioritizes familiar concepts; --limit controls the requested addition count. The supplied game/shared source and data must be freshly synchronized from Hetzner. Searchle membership must come from its active Numberbatch/FastText model indexes.

The importer evaluates the canonical private picker and paragraph-parser helpers without editing them. It retains proper-noun/named-entity/easy-tier checks, requires at least two unique 4–9 letter rankable title words within 45 letters, at least 400 characters of runtime-cleaned prose, and at least 50,000 annual human pageviews. Both public and solo target sets must produce grids whose paths spell every target without reusing cells. Placement scoring uses the title/target trie for fast offline validation; semantic scoring changes filler optimization, while guaranteed target placement remains the same canonical algorithm.

The tool writes a separate output snapshot and refuses output under /opt, inside source directories, or over an input baseline. Requests run sequentially with at least one second of pacing (two seconds used for this batch), honor Retry-After, and back off on throttling. Cache files are published atomically. Resume only with the same source/data baselines; use a fresh staging directory if those inputs change. No server or player state is edited.

## Validation and deployment

Run node --test scripts/import-wikipedia-expansion.test.js for output safety, additive preservation/canonical deduplication, body/popularity/title rejection, and grid path rejection. The prepared manifest also passes those content-proof checks for every addition. The input baseline SHA-256 is fb914dbc55d02b195417d37daf9a6dd7d912608bea768723c6bb5e29a51fb803; the output SHA-256 is 8d68c7e73eefb7a7c93b335668b96eb04934e67e6eeb5df529429e52b9262a8a.

Deploy the prepared data locally → temporary droplet file → backed-up canonical coverage, then restart mobile-relay before consumer games. Follow the project source-of-truth deployment guide; commit and push the same canonical snapshot afterward. Existing daily puzzles, sessions, accounts and rewards are unchanged.
