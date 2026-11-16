// Temporary verification listener for Phase 0.
// Connects to Chat Relay as a plain socket.io client and logs any
// searchle-round-start / searchle-round-end events it receives.

const { io } = require('socket.io-client');

const RELAY_URL = process.env.RELAY_URL || 'https://wordtycoon.live';
console.log(`[listener] connecting to ${RELAY_URL}...`);

const socket = io(RELAY_URL, { transports: ['websocket', 'polling'] });

socket.on('connect', () => console.log(`[listener] connected, id=${socket.id}`));
socket.on('disconnect', (r) => console.log(`[listener] disconnected: ${r}`));
socket.on('connect_error', (e) => console.log(`[listener] connect_error: ${e.message}`));

socket.on('searchle-round-start', (data) => {
  console.log(`[listener] >>> searchle-round-start  ${JSON.stringify(data)}`);
});
socket.on('searchle-round-end', (data) => {
  console.log(`[listener] >>> searchle-round-end    ${JSON.stringify(data)}`);
});

// Exit after 20 minutes so this doesn't run forever
setTimeout(() => { console.log('[listener] timeout (20m) — exiting'); process.exit(0); }, 20 * 60 * 1000);
