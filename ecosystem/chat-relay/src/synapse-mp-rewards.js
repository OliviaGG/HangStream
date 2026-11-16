'use strict';

const path = require('path');
const { createRewardOutbox, createRewardTransport } = require('./reward-outbox');

function createSynapseMpRewards({ directory = path.join(__dirname, '..', 'data', 'synapse-mp-reward-outbox'), baseUrl, apiSecret, request, send }) {
  const box = createRewardOutbox({ directory, send: send || createRewardTransport({ baseUrl, apiSecret, request }) });
  function reserve({ match, player, result }) {
    if (!player || !player.id || /^(?:web_guest_|guest[_-]|anon_|wsguest_)/i.test(String(player.id))) throw Error('Verified winner required');
    if (!match.id || result.winnerId !== player.id) throw Error('Authoritative match required');
    const eventId = 'synapse-mp:' + match.id;
    const xp = 30 + Math.min(70, Math.max(0, (20 - result.wordsUsed) * 5));
    return box.reserve({ platform: 'discord', userId: player.id, username: player.name,
      xp, game: 'synapse-mp', event: 'win', eventId },
    { matchId: match.id, matchNo: match.no, wordsUsed: result.wordsUsed, startedAt: match.startedAt });
  }
  return { ...box, reserve };
}

module.exports = { createSynapseMpRewards };
