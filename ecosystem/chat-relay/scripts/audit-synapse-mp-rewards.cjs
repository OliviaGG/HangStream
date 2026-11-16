// Read-only inventory: no worker, player database writes or economy requests.
const path = require('path');
const { createRewardOutbox } = require('../src/reward-outbox');
const box = createRewardOutbox({ directory: path.join(__dirname, '..', 'data', 'synapse-mp-reward-outbox'),
  send: () => { throw Error('Read-only audit'); } });
console.log(JSON.stringify({ readOnly: true, ...box.summary(),
  note: 'New authoritative arena wins only. Historical wins without event IDs require ledger evidence.' }, null, 2));
