# Audience Rooms

Audience rooms combine a private multiplayer game, room-scoped chat, presence,
and a next-game vote at `https://wordtycoon.live/<username>`.

## Product behavior

- Approved streamers automatically have a room derived from the existing
  streamer registry. The room's game follows the streamer's dashboard selection
  and the home-page directory shows it only while the stream connection is live.
- Donor Class and Pookie Pass members can create one persistent user room. The
  owner can switch games and close/reopen the same stable link. Open user rooms
  appear in the home-page directory until ten minutes without interaction.
  Closing removes the listing and private-session handle; the owner can reopen
  the same link from the home page.
- Watching is public. A verified Word Tycoon session is required to chat or
  vote. Existing game premium gates still control multiplayer participation.
- The owner can start a 45-second ballot. Each account can vote once; the
  winning private game starts automatically and tied winners are selected at
  random. Synapse and the non-session WikiWord mode are available only in
  streamer rooms.
- Game switching and vote controls are owner-only. The owner sees the idle vote
  card so they can start a ballot; everyone else sees the card only while the
  ballot is actively in the `voting` phase. It disappears for viewers when the
  vote finishes or is cancelled.
- Desktop defaults follow the 1920x1080 room reference: a 528px identity rail
  on the left, a 547px portrait game column flush with the page top and filling
  the viewport height, and 317px-wide vote/chat bubbles beside it. The toolbar
  (Open game, owner game picker, account, and game reset) sits above the sidebar
  and follows the game column when resized. The old yellow game header is
  removed; its heading remains accessible to screen readers. The default vote
  height is 270px and chat height is 464px at this viewport. Other desktop
  sizes adjust these proportions within minimum and maximum sizes.
- Native scrollbars inside room games are hidden, including nested scrollable
  panels. Mouse-wheel, touch, and keyboard scrolling remain available. The
  room shell installs this styling on each same-origin iframe load, including
  navigation between games; standalone game pages retain their existing styles.
- Each viewer can resize all three bubbles. The game uses its right edge
  (width), bottom edge (height), or lower-right corner (both). Chat and vote use
  their left edges, bottom edges, and lower-left corners. Arrow keys work on
  focused handles; Shift increases the step. Each bubble has a **Reset size**
  button and independent dimensions saved in that browser under
  `wt-room-game-size-v2` and `wt-room-side-sizes-v2`. Old v1 dimensions are
  ignored to apply the redesigned default to existing browsers. Chat and vote
  reset buttons are always available; the toolbar game reset appears after
  changing the game size.
- Growing a sidebar bubble borrows space from the game, preserving a 420px
  game minimum. Sidebar bubbles can narrow independently to 280px. Chat and
  vote minimum heights keep their controls visible, with messages and ballots
  scrolling internally. At 1200px or less the layout stacks and widths follow
  the screen; height is still adjustable by mouse, touch, or keyboard. Height
  limits are 280px–2400px for the game, 320px–2400px for chat, and
  240px–2400px for vote; sidebar minimums also account for their visible controls.

## Runtime ownership

- `src/rooms.js`: room persistence, slug allocation, presence, game allowlist,
  and ballot lifecycle.
- `data/rooms.json`: donor-room records. This is mutable runtime data and is
  ignored by Git. Streamer rooms are not duplicated here.
- `server.js`: HTTP APIs, donor eligibility, game URL generation, room-scoped
  Socket.IO chat/votes, and the `/<username>` page route.
- `public/room/`: the room shell.
- `public/portal/`: the Toon Tower ROOMS directory and **Open my room** action.

Presence and ballots are intentionally in memory. A relay restart clears stale
viewers and active votes. Room chat uses the existing chat database under
`audience:<slug>` keys and the existing 12-hour retention policy.
Donor-room activity time is persisted in `rooms.json`. Joining, input in the
room shell or embedded game, chat, voting, and game switching refresh it.
Directory polling and an idle connected socket do not. The server checks every
30 seconds and on startup, so an abandoned room also closes after a restart.
Streamer rooms follow stream status and do not use this timeout.

## Identity and authorization

The browser never supplies a trusted user ID. HTTP and Socket.IO handlers derive
the canonical Word Tycoon account from the verified portal session. Donor
eligibility comes from `computePerksById(...).donor`, which covers Donor Class
and Pookie Pass. Approved streamer ownership comes from the streamer registry.

Room slugs are lower-case, 1–32 characters, and limited to letters, digits,
underscores, and hyphens. Reserved public routes cannot be claimed. A collision
gets a stable account-derived suffix.

## Game sessions and embedding

Every room game uses its room slug as the game's private-session handle. Open
donor handles are included in `/api/streamer-handles` so game servers learn them
during their normal poll. The initial player URL also includes `?session=` so a
new room works immediately instead of waiting for that cache.

The iframe must use `ROOM_PLAYER_URL`'s same-origin
`https://wordtycoon.live/game/...` routes. Direct game-domain URLs are not safe
here because multiple game vhosts set `frame-ancestors 'self'` or
`X-Frame-Options: SAMEORIGIN` and will refuse to render inside the room.

Games that depend on a virtual mobile canvas do not receive top-level browser
scaling inside an iframe. `src/room-embed.js` declares their design widths:
980px for Subtextle/Searchle Grid/Number Search, 720px for WikiContexto, 640px
for WikiRectangled/WikiWord, and 480px for WikiWord 4x4. The room API returns
that width as `gameViewportWidth`. Whenever the game panel is narrower than
that design width, including after a desktop resize,
`public/room/room.js` lays out the iframe at its design width and uniformly
scales the whole canvas into the available space. Panels with enough width and
responsive games remain untransformed. Subtextle needs this because its
coarse-pointer keyboard is deliberately sized for a 980px viewport; without
the scale, the keyboard fills almost the entire room frame.

## Public routing

Chat Relay owns the Express route, but nginx normally rejects unknown
single-segment paths. Production therefore also needs the two locations stored
in `scripts/nginx-audience-rooms.conf`:

1. `/room/` proxies the shell's CSS and JavaScript.
2. The case-insensitive single-segment regex proxies vanity names to Chat Relay
   and intercepts Node 404s so invalid names use the existing custom 404.

Back up `/etc/nginx/sites-enabled/wordtycoon.live` outside the
`sites-enabled` directory, stage the replacement through `/tmp`, run
`sudo nginx -t`, and only then reload nginx.

## Verification

```powershell
curl.exe -I https://wordtycoon.live/<known-streamer>
curl.exe -I https://wordtycoon.live/room/room.js
curl.exe -I https://wordtycoon.live/definitely-not-a-room
curl.exe https://wordtycoon.live/api/rooms
```

Expected results are `200`, `200`, `404`, and a directory payload. Also verify
in a real browser that the game appears inside the iframe and the loading mask
clears; an HTTP 200 alone will not catch frame-policy failures. Check both a
mobile viewport and desktop, and confirm the embedded document has no
horizontal overflow.
Drag the edges across the iframe, verify that chat remains visible and the game
does not reload, then refresh to verify the saved size and use **Reset size**.
Also resize chat and vote independently, check that inputs and buttons remain
visible with long content scrolling, and confirm that vote visibility rules and
stored dimensions survive ballot state changes.
