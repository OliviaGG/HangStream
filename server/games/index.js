// Public surface of the server-authoritative game layer.
//
// server.js only needs a handful of things from this module: create a registry,
// feed it ws messages, feed it chat, and let it broadcast back out.

const dictionary = require('./dictionary');
const rounds = require('./rounds');
const { Game, scoreWordFull, playerKeyFor } = require('./engine');
const { SpellingBeeGame } = require('./spellingbee');
const { WordleGame, evaluateGuess } = require('./wordle');
const { HangmanGame } = require('./hangman');
const { SpeedScrambleGame, scrambleWord } = require('./speedscramble');
const { SearchleGame } = require('./searchle');
const { GameRegistry, getDailyDate, GAME_META } = require('./registry');

module.exports = {
  // Core engine
  Game,
  scoreWordFull,
  playerKeyFor,
  // Games
  SpellingBeeGame,
  WordleGame,
  HangmanGame,
  SpeedScrambleGame,
  SearchleGame,
  evaluateGuess,
  scrambleWord,
  // Registry + support
  GameRegistry,
  getDailyDate,
  GAME_META,
  dictionary,
  rounds,
};
