// Chat-path check: a viewer typing the answer in chat must drive the engine.
// Simulates what server.js `feedChatToGames` does, against the live rooms.
const layer = require('C:/Users/Olivia Garcia-Godos/HangStream/server/games');

(async () => {
  const registry = new layer.GameRegistry({ broadcast: () => {}, persist: () => {} });
  const checks = [];
  const check = (name, cond, extra) => checks.push({ name, ok: !!cond, extra: extra === undefined ? '' : JSON.stringify(extra) });

  // Hangman: chat sends a single letter and then the whole word.
  registry.startRound('chatcheck', 'hangman', {});
  const h = registry.room('chatcheck', 'hangman');
  const letter = await registry.sendChatGuess('twitch', 'chatcheck', h.word[0], { username: 'viewer1' });
  check('chat letter reaches hangman', letter && letter[0].accepted && letter[0].result === 'correct', letter && letter[0].result);
  const solve = await registry.sendChatGuess('twitch', 'chatcheck', h.word, { username: 'viewer2' });
  check('chat word solves hangman', solve && solve[0].win, solve && solve[0].result);

  // Speed Scramble: chat sends the unscrambled answer.
  registry.startRound('chatcheck', 'speedscramble', {});
  const s = registry.room('chatcheck', 'speedscramble');
  const sSolve = await registry.sendChatGuess('twitch', 'chatcheck', s.answer, { username: 'viewer3' });
  check('chat word solves speedscramble', sSolve && sSolve[0].accepted && sSolve[0].result === 'correct', sSolve && sSolve[0].result);

  // A wrong chat word is rejected quietly (no broadcast spam).
  const wrong = await registry.sendChatGuess('twitch', 'chatcheck', 'zzzzq', { username: 'viewer4' });
  check('nonsense chat word is ignored', !wrong || !wrong.some((r) => r.accepted));

  // Round completion fires the vote's term clock.
  let completed = null;
  registry.onRoundComplete = (streamerId, gameId) => { completed = { streamerId, gameId }; };
  registry.startRound('chatcheck', 'spellingbee', { letters: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], centerLetter: 'a' });
  const bee = registry.room('chatcheck', 'spellingbee');
  // Find every answer so the round actually completes.
  for (const w of bee.answers) await registry.sendChatGuess('twitch', 'chatcheck', w, { username: 'solver' });
  await new Promise((r) => setTimeout(r, 300));
  check('round completion reaches the vote hook', completed && completed.gameId === 'spellingbee', completed);

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? '  ' + c.extra : ''}`);
  }
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error('ERR', e); process.exitCode = 1; });
