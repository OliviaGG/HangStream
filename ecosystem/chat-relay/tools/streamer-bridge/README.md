# Tycoon Stream Bridge

Lightweight local bridge for streamer-mode game pages.

## What it does

- connects to TikFinity at `ws://127.0.0.1:21213`
- can also mirror your own streamer feed from the Word Game Live cloud socket
- keeps separate per-source status, counters, and recent-event buffers
- exposes a local Socket.IO feed on `http://127.0.0.1:21420`
- lets you enable either source or both while picking one primary relay source
- serves a local launcher plus a dual-source dashboard

## Run locally

From `C:\Chat Relay\tools\streamer-bridge`:

```powershell
npm install
npm start
```

or

```powershell
node server.js
```

Then open:

- `http://127.0.0.1:21420`

## Cloud feed handoff

The easiest way to configure the cloud source is from your streamer dashboard:

1. Open `https://wordgame.live/streamer`
2. Click `Connect Local Bridge`
3. Your browser is redirected to the local bridge's `/connect` route
4. The bridge stores the token locally, enables Cloud, and switches primary to `cloud`

You can also paste a bridge token directly into the local dashboard as a fallback.

## Environment variables

- `STREAM_BRIDGE_PORT`
- `STREAM_BRIDGE_HOST`
- `TIKFINITY_WS_URL`
- `TICKFINITY_WS_URL` (legacy fallback)
- `STREAM_BRIDGE_DEBUG_RAW=1`
- `STREAM_BRIDGE_OPEN_BROWSER=1`
- `STREAM_BRIDGE_OPEN_LAUNCHER=0` (optional override if you only want the browser dashboard)

## Build a Windows app

From `C:\Chat Relay\tools\streamer-bridge`:

```powershell
npm install
npm run package:win
```

That produces:

- `dist\TycoonStreamBridge.exe`

When you open the EXE, it should now open a small launcher window automatically.
From there you can open the dashboard or jump straight into the supported `/stream` game pages.

For a portable folder version instead of a single EXE:

```powershell
npm run package:folder
```

## Intended consumer routes

- `https://rectangled.live/stream`
- `https://erectangled.com/stream`
- `https://searchle.live/stream`

## Notes

- The bridge runs locally on your computer.
- It does not expose your local TikFinity connection to the public internet.
- The `/stream` game pages still use the normal hosted game servers for game state; the bridge only provides local chat input.
- `config.json` is stored next to the EXE when packaged so source toggles, cloud URL, and bridge token persist between launches.
