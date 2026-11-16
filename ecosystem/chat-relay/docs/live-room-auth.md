# Live-room iframe sign-in

Audience-room games are served through Word Tycoon's same-origin `/game/:id/`
proxy. Gameplay sockets must use `/game/:id/socket.io` on that same origin so
the browser sends the existing Word Tycoon session cookies to the game server.
The game verifies those cookies through Chat Relay; browser identity claims do
not authorize gameplay.

WikiContexto previously connected embedded pages directly to `wikicontexto.com`.
Its page could load the signed-in user's profile through Word Tycoon while its
gameplay socket arrived without the Word Tycoon cookie. Submitting a guess then
produced a second sign-in prompt.

The WikiContexto Vite client now explicitly selects
`/game/wikisearchle/socket.io` for proxied pages and preserves `auth.session` for
the private room. Direct game pages keep their own `/socket.io`. Chat Relay's
legacy Socket.IO script wrapper follows the same rule. Explicit connections to
the relay retain their own origin and path.

Regression coverage: WikiContexto's `test/online-socket-routing.test.cjs` and
Chat Relay's `test/proxy-socket-routing.test.cjs`. Production checks must cover
polling, direct WebSocket connections, polling-to-WebSocket upgrades, and the
embedded title/article/live updates. Multiplayer eligibility remains enforced
by the game server after cookie verification.

All audience-room player URLs stay on the room origin. The HTML proxy also
normalizes legacy hub account URLs in fetch, Request and XMLHttpRequest calls,
including relative account URLs under a game's proxy prefix. Game APIs and
explicit third-party requests retain their existing destination.
The existing game embed deployment version is included in every room iframe URL
so upstream HTML validators cannot preserve an older injected auth/socket shim.

Internal `whoami` accepts both the signed `connect.sid` portal session and the
verified `wt_remember` cookie. Session-only login works when device trust is
disabled. The session signature, live session store, expiry and device-family
revocation are checked before returning the server's account. Store errors and
timeouts fail closed; a verified remembered cookie still works after restart.
Every room game's HTTP identity resolver accepts either cookie proof and leaves
verification to this internal endpoint. WikiContexto's dedicated socket resolver
uses the same cookie choices. Eligibility checks still apply after sign-in.

Colour500 reads the validated private `session` query before interpreting its
proxied path. Subtextle, Grid and Number Search frames add `mobile=1` to select
Searchle's existing mobile keyboard and rendering tier on desktop as well.

Additional regression coverage: `test/game-cookie-identity.test.cjs`,
`test/game-proxy-browser.test.cjs` and `test/room-player-routing.test.cjs`.
