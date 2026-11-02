#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SEARCHLE_ROOT = path.join(__dirname, '..');
const BANK_ROOT = path.join(SEARCHLE_ROOT, 'shared', 'word-bank');
const targetsPath = path.join(SEARCHLE_ROOT, 'data', 'target-words.json');
const dictionaryPath = path.join(BANK_ROOT, 'dictionary.json');
const frequencyPath = path.join(BANK_ROOT, 'frequency.json');
const easyPath = path.join(BANK_ROOT, 'searchle-easy-targets.json');
const veryEasyPath = path.join(BANK_ROOT, 'searchle-very-easy-targets.json');
const blockedPath = path.join(BANK_ROOT, 'blocked-words.json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

function asWordSet(value) {
  if (Array.isArray(value)) return new Set(value.map(word => String(word).toLowerCase()));
  if (value && typeof value === 'object') {
    const words = [];
    for (const [key, entry] of Object.entries(value)) {
      if (Array.isArray(entry)) {
        words.push(...entry);
      } else if (typeof entry === 'string') {
        words.push(entry);
      } else if (!/^\d+$/.test(key)) {
        words.push(key);
      }
    }
    return new Set(words.map(word => String(word).toLowerCase()));
  }
  return new Set();
}

function normalizeWord(value) {
  return String(value || '').trim().toLowerCase();
}

function main() {
  const targets = readJson(targetsPath);
  const dictionary = readJson(dictionaryPath);
  const frequency = readJson(frequencyPath, {});
  const easy = asWordSet(readJson(easyPath, []));
  const veryEasy = asWordSet(readJson(veryEasyPath, []));
  const blocked = asWordSet(readJson(blockedPath, []));
  const dictionaryWords = asWordSet(dictionary);
  const targetWords = targets.map(normalizeWord);
  const counts = new Map();
  targetWords.forEach(word => counts.set(word, (counts.get(word) || 0) + 1));

  const issues = [];
  const seen = new Set();
  const tierCounts = { 'very-easy': 0, easy: 0, hard: 0, unclassified: 0 };
  const frequencyValues = [];

  targetWords.forEach((word, index) => {
    if (!word) {
      issues.push({ word, index, issue: 'empty-target' });
      return;
    }
    if (seen.has(word)) issues.push({ word, index, issue: 'duplicate-target' });
    seen.add(word);
    if (!/^[a-z]+$/.test(word)) issues.push({ word, index, issue: 'invalid-target-format' });
    if (!dictionaryWords.has(word)) issues.push({ word, index, issue: 'missing-from-dictionary' });
    if (blocked.has(word)) issues.push({ word, index, issue: 'blocked-word' });

    const tier = veryEasy.has(word) ? 'very-easy' : easy.has(word) ? 'easy' : 'hard';
    tierCounts[tier] += 1;
    const score = Number(frequency[word]);
    if (Number.isFinite(score)) frequencyValues.push(score);
    else issues.push({ word, index, issue: 'missing-frequency' });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      targets: path.relative(process.cwd(), targetsPath),
      dictionary: path.relative(process.cwd(), dictionaryPath),
      frequency: path.relative(process.cwd(), frequencyPath),
    },
    totals: {
      targetEntries: targetWords.length,
      uniqueTargets: seen.size,
      dictionaryWords: dictionaryWords.size,
      issues: issues.length,
    },
    tiers: tierCounts,
    frequency: {
      coveredTargets: frequencyValues.length,
      minimum: frequencyValues.length ? Math.min(...frequencyValues) : null,
      maximum: frequencyValues.length ? Math.max(...frequencyValues) : null,
      average: frequencyValues.length
        ? Number((frequencyValues.reduce((sum, value) => sum + value, 0) / frequencyValues.length).toFixed(3))
        : null,
    },
    issues,
  };

  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);
    console.log(`Searchle audit written to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }

  if (issues.length > 0) process.exitCode = 1;
}

main();
