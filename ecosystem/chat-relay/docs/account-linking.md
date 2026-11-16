# Account Linking Architecture

## Overview

Cross-platform account linking allows users who play from TikTok, YouTube, and Discord to have a unified identity. This enables combined win counts, shared leaderboard entries, and unified cosmetics across platforms.

## Source of Truth

**Word Tycoon (port 3020)** is the single source of truth for account linking.

- Database: `data/word-tycoon.db` table `linked_accounts`
- Schema: `discord_user_id`, `platform`, `platform_user_id`, `display_name`, `profile_pic`, `username`, `linked_at`
- Each linked group is keyed by a Discord user ID (snowflake)
- A user can have multiple platforms linked to one Discord ID

## How Users Link Accounts

1. User types `/link` in Discord (via Word Tycoon's Discord bot)
2. Bot generates a 4-digit verification code (valid 10 minutes)
3. User types `!verify <code>` in TikTok or YouTube live chat
4. Word Tycoon verifies the code, creates the `linked_accounts` record
5. Accounts are merged (coins, businesses, cosmetics unified)

## How Games Receive Linked Identity

```
Word Tycoon DB                Chat Relay (relay.js)              Game Servers
linked_accounts  ──(HTTP)──>  _linkedCache (Map)   ──(Socket)──>  msg.linkedDiscord
                              refreshes every 5min                on every chat message
```

1. **Chat Relay** (`src/relay.js`) fetches linked groups from Word Tycoon's API every 5 minutes:
   `GET http://localhost:3020/api/admin/accounts/linked-groups`
2. Builds a cache: `"platform:userId" -> discordUserId`
3. On every chat message, looks up the sender and sets `msg.linkedDiscord`:
   - Linked user: `linkedDiscord = their linked Discord snowflake ID`
   - Discord/mobile user: `linkedDiscord = their own Discord ID`
   - Unlinked user: `linkedDiscord = null`
4. All game servers receive `linkedDiscord` on every relay message

## How Games Use linkedDiscord

Games use `linkedDiscord` to unify identity for:
- **Win counting**: Match wins by `platformUserId` OR `linkedDiscord`
- **Leaderboards**: Group entries by `linkedDiscord` when available
- **Win badges**: Show combined cross-platform win count

### Cross-platform win matching logic (used by all games):

```javascript
function countUserWins(history, userId, linkedDiscord) {
  let count = 0;
  for (const w of history) {
    const wId = w.user ? (w.user.platformUserId || w.user.id) : w.userId;
    const wLd = w.user ? w.user.linkedDiscord : null;
    if (wId === userId) { count++; continue; }
    if (linkedDiscord && wLd && wLd === linkedDiscord) { count++; continue; }
    if (linkedDiscord && wId === linkedDiscord) { count++; continue; }
    if (wLd && wLd === userId) { count++; continue; }
  }
  return count;
}
```

## Game Integration Status

| Game | Port | Uses linkedDiscord | Win Tracking | Leaderboard |
|------|------|--------------------|-------------|-------------|
| Searchle | 3015 | Yes | Unified | Grouped by linkedDiscord |
| Word 500 | 3011 | Yes | Unified | Keyed by linkedDiscord |
| Betweenly | 3017 | Yes | Unified | Grouped by linkedDiscord |
| PixeLetters | 3012 | Yes | Unified | Player dedup by linkedDiscord |
| SpellingBee | 3013 | Yes | Unified | Merged scores by linkedDiscord |
| Wordle | 3014 | Yes | Unified | Keyed by linkedDiscord |
| Monopoly | 3030 | Stored | N/A (game state per session) | N/A |
| My Bubble | 3010 | No | Team-based (no individual) | N/A |
| Word 1000 SP | 3018 | No | Client-side only | N/A |
| Interactive Squaredle | 3016 | No | No chat integration | N/A |
| StreamDeck | 3025 | No | No chat integration | N/A |

## Admin Management

The Accounts tab in the Chat Relay dashboard (`http://localhost:3000`) proxies to Word Tycoon's admin API:

| Dashboard Route | Proxied To (Word Tycoon) | Purpose |
|----------------|--------------------------|---------|
| `/api/accounts-admin/linked-groups` | `/api/admin/accounts/linked-groups` | List all linked groups |
| `/api/accounts-admin/search` | `/api/admin/accounts/search` | Search players |
| `/api/accounts-admin/:id/link` | `/api/admin/accounts/:id/link` | Link platform account |
| `/api/accounts-admin/:id/unlink` | `/api/admin/accounts/:id/unlink` | Unlink platform account |
| `/api/accounts-admin/:id/merge` | `/api/admin/accounts/:id/merge` | Re-merge linked accounts |
| `/api/accounts-admin/multi-link` | `/api/admin/accounts/multi-link` | Bulk link multiple players |

## Chat Commands

Chat commands for linking were removed from Chat Relay (they previously used a separate, unused database). When users type `/link` in TikTok/YouTube chat, they are redirected to use the Word Tycoon Discord bot.

## Key Files

| File | Role |
|------|------|
| `Word Tycoon/src/database.js` | Source of truth: `linked_accounts` table, merge algorithm |
| `Word Tycoon/server.js` | API endpoints for linking/unlinking/merging |
| `Word Tycoon/discord-bot/src/commands/handler.js` | Discord `/link` command (generates verification code) |
| `Word Tycoon/src/commands.js` | `!verify` command handler (processes code from TikTok/YouTube) |
| `Chat Relay/src/relay.js` | Caches linked groups, broadcasts `linkedDiscord` on messages |
| `Chat Relay/server.js` | Proxies admin API routes to Word Tycoon |

## Deployment Notes

- Word Tycoon must be running before Chat Relay for the linked-groups cache to load
- If Word Tycoon is unavailable at startup, relay.js retries every 5 minutes
- After linking/unlinking accounts, the cache auto-refreshes within 5 minutes
- For immediate effect, restart Chat Relay's `mobile-relay` PM2 process
