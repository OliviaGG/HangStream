"""
Generate wordfreq-full.json from the wordfreq Python library.
Uses 7+ combined corpora (Wikipedia, Google Books, Reddit, Twitter, SUBTLEX, OpenSubtitles, Leeds)
for the most accurate English word frequency data available.

One-time run: python tools/generate-wordfreq.py
Requires: pip install wordfreq
"""
from wordfreq import zipf_frequency
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'word-bank')
DICT_PATH = os.path.join(DATA_DIR, 'dictionary.json')
OUTPUT_PATH = os.path.join(DATA_DIR, 'wordfreq-full.json')

print('Loading dictionary...')
with open(DICT_PATH, 'r', encoding='utf-8') as f:
    dictionary = json.load(f)

# Generate Zipf scores for all dictionary words
freq = {}
total = 0
covered = 0

for length, words in dictionary.items():
    for w in words:
        total += 1
        word = w.lower()
        z = zipf_frequency(word, 'en')
        if z > 0:
            freq[word] = round(z, 2)
            covered += 1

# Sort alphabetically
freq_sorted = dict(sorted(freq.items()))

print(f'Dictionary words: {total}')
print(f'Covered by wordfreq: {covered} ({covered/total*100:.1f}%)')
print(f'No data (will use fallback): {total - covered}')

# Tier distribution preview
tiers = {'surface (>=5.0)': 0, 'shallow (4-5)': 0, 'medium (3-4)': 0, 'deep (<3)': 0}
for z in freq_sorted.values():
    if z >= 5.0: tiers['surface (>=5.0)'] += 1
    elif z >= 4.0: tiers['shallow (4-5)'] += 1
    elif z >= 3.0: tiers['medium (3-4)'] += 1
    else: tiers['deep (<3)'] += 1

print('\nTier distribution:')
for tier, count in tiers.items():
    print(f'  {tier}: {count}')

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(freq_sorted, f)

size_kb = os.path.getsize(OUTPUT_PATH) / 1024
print(f'\nWrote {OUTPUT_PATH}')
print(f'  {len(freq_sorted)} entries, {size_kb:.1f} KB')
