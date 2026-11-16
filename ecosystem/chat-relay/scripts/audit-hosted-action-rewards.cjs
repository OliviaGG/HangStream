// Read-only inventory: starts no workers and makes no economy requests.
const path = require('path');
const { createRewardOutbox } = require('../src/reward-outbox');
const games = ['letterworks', 'wordfall'];
console.log(JSON.stringify({ readOnly: true, games: games.map(game => ({ game,
  ...createRewardOutbox({ directory: path.join(__dirname, '..', 'data', game + '-reward-outbox'),
    send: () => { throw Error('Read-only audit'); } }).summary() })),
  note: 'New claims only. Historical claim rows without event IDs require ledger evidence.' }, null, 2));
