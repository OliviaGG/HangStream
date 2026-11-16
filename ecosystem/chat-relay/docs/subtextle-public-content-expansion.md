# Subtextle public targets — October 6, 2026

This expansion adds basketball, television, electricity, photography, architecture, technology, literature, university, and government to the shared target bank and Searchle easy whitelist. The bank grows from 6,915 to 6,924 words; the easy whitelist grows from 2,801 to 2,810 words. [The release manifest](../data/content-expansions/subtextle-public-2026-10-06.json) records the exact words and input/output checksums.

Every addition has canonical dictionary/model membership, unchanged morphology, Zipf frequency of at least 4.4, allowed target policy status, and manually checked semantic neighbors. All ordered target buckets below ten letters and all original easy-list entries remain identical. This preserves the five- and seven-letter inputs used for published daily and weekly puzzles elsewhere in the ecosystem.

## Reproduction

Use a fresh isolated Hetzner snapshot containing Subtextle's canonical `server/game-manager.js`, model membership and morphology map, plus `relay/src/game-word-policy.js`, `relay/src/word-bank-exclusions.js`, and the canonical shared dictionary, frequencies, targets and easy whitelist. Write the output outside that snapshot:

```powershell
node scripts/expand-subtextle-public-targets.cjs --snapshot-root="C:\path\to\snapshot" --output-dir="C:\path\to\separate-output"
node --test test/subtextle-public-expansion.test.cjs
```

The script refuses shorter words, duplicates, missing vectors, changed morphology, low frequency, blocked words and snapshot/production output paths. Shared word-bank runtime files remain ignored by Git. The exact prepared [target bank](../data/content-expansions/subtextle-targets-2026-10-06.json) and [easy whitelist](../data/content-expansions/subtextle-easy-targets-2026-10-06.json) are mirrored as dated snapshots, with newline conversion disabled so their deployment hashes survive Windows checkouts. The generator and manifest describe their additive change.

## Deployment

Transfer the locally prepared files to `/tmp`, check both preimage and output hashes against the manifest, back up the canonical files, then copy the prepared catalogs into `/opt/chat-relay/data/word-bank/`. Restart `mobile-relay` first so it serves the new bank, then restart `searchle-mobile` to refresh its cached bank and easy list. Verify service health and that all original shorter buckets remain identical. Deploy the accompanying Subtextle solo files first: their installer checks the original shared-bank and coverage snapshot hashes.
