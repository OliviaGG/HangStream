'use strict';
const { createGameActionJournal } = require('./game-action-journal');
function createMultiplayerGameActions({ directory, gameId, Game, wordlist, sdk, resolveCompletion, onError = () => {}, journalOptions = {} }) {
  const journal = createGameActionJournal({ directory, game: gameId, sdk, ...journalOptions }), owners = new WeakMap();
  const restore = (game, state) => game.restoreFrom(state, wordlist.getTrie(), wordlist.getTargetSet(), wordlist.getFrequencyMap(), { trusted: true });
  function adopt(game, record) { owners.set(game, { scope: record.scope, roundId: record.roundId }); return game; }
  function load(scope) {
    const record = journal.current(scope); if (!record) return null;
    const game = new Game(); restore(game, record.state); adopt(game, record); return { game, record };
  }
  function recordFor(game) {
    const owner = owners.get(game); if (!owner) return null;
    const record = journal.current(owner.scope); if (!record || record.roundId !== owner.roundId) throw Error('Obsolete multiplayer game'); return record;
  }
  function save(game, scope, meta) {
    const owner = owners.get(game), state = game.saveState({ exact: true });
    const record = owner ? journal.commit(owner.scope, owner.roundId, state, meta) : journal.start(scope, state, meta);
    adopt(game, record); return record;
  }
  function reward(platform, userId, username, displayName, coins, event, extras = {}) {
    return { ...extras, platform: String(platform || 'unknown'), userId: String(userId || ''), username: String(username || displayName || 'Anonymous'),
      displayName: String(displayName || username || 'Anonymous'), coins, game: gameId, event };
  }
  const eligible = (platform, userId) => !['bot', 'system'].includes(String(platform || '').toLowerCase()) && sdk.isStatsEligible(platform, userId);
  function recover() { try { return journal.recover(); } catch (error) { onError(error); return 0; } }
  function guess(game, scope, meta, ...args) {
    if (!owners.has(game)) save(game, scope, meta);
    const owner = owners.get(game), before = JSON.parse(JSON.stringify(game.saveState({ exact: true })));
    let result, previous;
    try {
      previous = recordFor(game); result = game.guess(...args);
      if (result.result === 'correct') {
        const [word, platform, userId, username, displayName] = args, intentions = [];
        const coins = (result.isThreeLetter ? 100 : result.isHidden ? 1000 : result.isRare ? 500 : 1500) +
          (sdk.getLetterRarityBonus(word)?.bonus || 0) + (sdk.getWordLengthBonus(word) || 0);
        if (eligible(platform, userId)) intentions.push({ key: 'word:' + result.word, payload: reward(platform, userId, username, displayName, coins, 'word', { word: result.word }) });
        const completion = result.isComplete ? (previous.completion || (!previous.meta.complete ? resolveCompletion(game, meta) : undefined)) : undefined;
        if (completion?.winner && completion.amount > 0 && eligible(completion.winner.platform, completion.winner.platformUserId)) {
          const winner = completion.winner;
          intentions.push({ key: 'win', payload: reward(winner.platform, winner.platformUserId, winner.displayName, winner.displayName,
            completion.amount, completion.event, { guessCount: winner.score, ...(completion.period ? { rewardPeriod: completion.period } : {}) }) });
        }
        journal.commit(owner.scope, owner.roundId, game.saveState({ exact: true }), { ...meta, complete: !!result.isComplete }, intentions, completion);
      }
    } catch (error) { restore(game, before); throw error; }
    if (result.result === 'correct') recover();
    return result;
  }
  function sendLegacyReward(platform, userId, displayName, coins, event, extras, game) {
    // Existing game handlers keep their celebrations. Persistent recipients use
    // only the immutable intention already committed with the accepted guess.
    if (!eligible(platform, userId)) {
      if (sdk.isGuestId(userId) || String(platform).toLowerCase() === 'bot') return sdk.rewardPlayer(platform, userId, displayName, displayName, coins, gameId, event, extras);
      return null;
    }
    const record = recordFor(game); if (!record) throw Error('Reward lacks a durable multiplayer game');
    const key = event === 'word' ? 'word:' + String(extras.word || '').trim().toLowerCase() : 'win';
    if (!record.actions[key]) throw Error('Reward lacks an accepted durable game action');
    recover(); return null;
  }
  journal.startRecovery(onError);
  return { load, adopt, save, guess, recordFor, recover, sendLegacyReward, journal };
}
module.exports = { createMultiplayerGameActions };
