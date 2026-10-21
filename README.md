# HangStream

Turn chat into an interactive game. HangStream is a real-time multiplayer hangman game that integrates with Twitch and TikTok live streams, allowing viewers to play via chat or web interface.

## 🎮 Features

### For Viewers
- **Play via Chat**: Type your guesses directly in the streamer's Twitch or TikTok chat
- **Web Interface**: Play with an on-screen keyboard on the viewer page
- **Solo Practice Mode**: Practice alone without needing a live stream
- **Score Tracking**: Sign in to track your scores across all streams
- **Leaderboards**: Compete with other viewers for the top scores
- **Social Account Integration**: Connect your Twitch and TikTok accounts to your profile

### For Streamers
- **Chat Integration**: Automatically connects to Twitch and TikTok chat
- **Music Requests**: Viewers can request songs via chat using `!play <song>` (Spotify integration)
- **Custom Game Settings**: Adjust difficulty and game options
- **OBS Overlay**: Clean overlay designed for streaming software
- **Viewer Participation Controls**: Enable or disable web play for your stream
- **Per-Streamer Leaderboards**: Track scores separately for each streamer's audience
- **Application System**: Streamers must apply and be approved to access dashboard

### Authentication
- **Google Sign-In**: Secure OAuth authentication for all users
- **Protected Pages**: Profile, leaderboard, and streamer settings require sign-in
- **Public Discovery**: Homepage and viewer page are publicly accessible
- **API Keys**: Approved streamers receive API keys for dashboard authentication

## 🚀 Getting Started

### Prerequisites
- Node.js **20.19+** (or 22.12+) — see `engines` in `package.json`. The floor is
  that `tiktok-live-connector` v2.5+ is ESM-only and HangStream `require()`s it,
  which needs `require(esm)` support.
- npm

### Installation

1. Clone the repository and navigate to the project directory:
```bash
cd HangStream
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file and configure it:
```bash
cp .env.example .env
```

4. Edit `.env` with your credentials:
```env
NODE_ENV=production
PORT=8080
TOKEN_ENCRYPTION_KEY=<generate a random string>
GOOGLE_CLIENT_ID=<your Google client ID>
GOOGLE_CLIENT_SECRET=<your Google client secret>
GOOGLE_OWNER_REDIRECT_URI=https://yourdomain.com/oauth/google/callback
GOOGLE_VIEWER_REDIRECT_URI=https://yourdomain.com/auth/google/callback
ADMIN_PASSWORD=<secure password for admin dashboard>
SPOTIFY_CLIENT_ID=<optional, for music requests>
SPOTIFY_CLIENT_SECRET=<optional, for music requests>
SPOTIFY_REDIRECT_URI=https://yourdomain.com/oauth/spotify/callback
TIKTOK_CLIENT_KEY=<optional, for TikTok chat>
TIKTOK_CLIENT_SECRET=<optional, for TikTok chat>
TIKTOK_REDIRECT_URI=https://yourdomain.com/oauth/callback
TIKTOK_VIEWER_REDIRECT_URI=https://yourdomain.com/auth/tiktok/callback
TWITCH_CLIENT_ID=<optional, for Twitch chat>
TWITCH_CLIENT_SECRET=<optional, for Twitch chat>
TWITCH_REDIRECT_URI=https://yourdomain.com/oauth/twitch/callback
TWITCH_VIEWER_REDIRECT_URI=https://yourdomain.com/auth/twitch/callback
```

5. Start the server:
```bash
npm start
```

6. Open `http://localhost:8080` in your browser

## 🎯 How It Works

### For New Users
1. Visit the homepage to learn about the game
2. Sign in with Google to access all features
3. Go to the viewer page (`/viewer`) to play
4. Choose between solo practice or join a live streamer
5. Track your scores on the leaderboard and profile

### For Streamers
1. Apply to become a streamer via the application form (`/apply`)
2. Wait for approval from the admin
3. Once approved, access the streamer settings (`/streamer`) to:
   - Connect your Twitch and TikTok accounts
   - Connect Spotify for music requests
   - Configure game settings
   - Enable/disable web play for viewers
   - View your API key

### During a Stream
1. Start your broadcast on Twitch or TikTok
2. Viewers can play by typing in chat or visiting `/viewer`
3. Chat messages are processed as game guesses
4. Scores are tracked for all authenticated viewers
5. Use the OBS overlay (`/your-streamer-name/overlay`) in your streaming software

## 🧠 Game Backend

Games run on a single server-authoritative engine (`server/games/`) so chat and
page guesses are judged by the same rules — the client can never read the
answer or award itself points.

- **One room per streamer and game.** A room holds the round, its answer set,
  scores and history. Entering `online` mode auto-starts a round if none is
  running; idle rooms are recycled after a few hours.
- **Chat and web share a room.** A guess typed in Twitch/TikTok chat is fed in
  via `feedChatToGames`, and a guess from the page arrives over the existing
  WebSocket as `{ type: 'guess', game, word }`. Both return the same result
  shape, and a word is only scored for whoever finds it first.
- **Rounds roll over daily** on `America/Edmonton`, matching Word Tycoon.
  Daily and in-progress round state is stored in the `game_rounds` and
  `game_daily_played` SQLite tables.
- **Word Bank.** `dictionary.js` reuses the word lists already in the repo
  (the Searchle dictionary, `custom-words.json`, `wordle-words.js`) — no extra
  data files to download.
### Games

| Game | Input | Round ends when |
|---|---|---|
| 🐝 Spelling Bee | words from the 7-letter set | every answer is found |
| 🟩 Wordle | 5-letter guesses | solved, or 6 guesses spent |
| 🎯 Hangman | letters *or* the whole word | the board is revealed solved |
| ⚡ Speed Scramble | the unscrambled word | solved, or the clock runs out |
| 🔎 Searchle | any word (ranked vs. a hidden target) | rank #1, or 10 guesses spent |

Spelling Bee, Wordle and Searchle already had backends in the repo; Hangman and
Speed Scramble used to be judged entirely in the browser and are now
server-authoritative too. Their **pages are unchanged** — solo play still runs
locally, and online play just routes guesses through the engine.

Two games need to know something the base engine does not model:

- **Hangman is letter-based.** Its real input is a single letter, so it adds
  `guessLetter` alongside the engine's word contract. A completed word in chat
  is treated as a whole-word solve; a wrong whole word costs no strike (the
  keyboard is the strike mechanism).
- **Searchle is async and rank-based.** Ranking runs over an embedding model, so
  `sendChatGuess` and the `guess` WebSocket message both return a promise that
  `server.js` resolves when the verdict lands. Its round is fixed at 10 guesses
  and its target is never serialized while the round can still be won. Searchle
  refuses to start (rather than crashing) until its model is built.

Neither game's answer ever reaches a client while the round is live: Hangman and
Speed Scramble expose a masked/anagrammed board, and Searchle exposes ranks.

### Word bank

The games draw from two pools that share one `{ word, cat, difficulty }`
contract, so the pages and the server pick from the same list:

| Pool | File | Size | Category |
|---|---|---|---|
| Curated | `public/custom-words.json` | 542 words, 45 categories | a real hint |
| General | `public/word-bank.json` | 6,915 words | `Common` |

- **Curated** is the hand-picked list the Hangman page always used, plus
  concrete nouns from Wikipedia's [list of 1000 basic
  words](https://simple.wikipedia.org/wiki/Wikipedia:List_of_1000_basic_words).
  Every entry carries a category, so the badge on stream is a usable hint.
- **General** is the Word Tycoon ecosystem's own shared target list, vendored
  into `server/searchle/shared/word-bank/` and tagged by difficulty here. It
  carries no category, so those rounds show `Common`.

The picker (`dictionary.randomTarget`) draws mostly from the general pool —
variety matters over a long stream — but prefers a curated word often enough
that the category badge keeps meaning something. A band with too few curated
words to avoid repeats falls back to the general pool entirely, and either pool
serves a word only once before it is reshuffled.

Difficulty combines word length with the upstream frequency tier: length
dominates (a twelve-letter word is a hard board whatever it means), and within
a length band the tier decides. The length bands are the same on the server and
in the pages — easy 4–6, medium 5–8, hard 8–20 for Hangman; easy 4–5,
normal 5–7, hard 7–10, extreme 9–14 for Speed Scramble.

**Blocklist.** `server/games/word-policy.js` ports the ecosystem's shared
blocklist (`server/searchle/shared/word-bank/blocked-words.json`) and applies it
in every role a word can play: it can never be the answer, a board word, or a
scored guess. A blocked guess is refused without the word being echoed back.

**Rebuilding the pools.** The build is deterministic and offline — every input
is vendored in the repo:

```bash
npm run build:word-bank
```

| Source | Licence |
|---|---|
| [Word Tycoon ecosystem](https://github.com/johnrstanley11-gif/word-tycoon-ecosystem) — shared word bank | MIT |
| Wikipedia list of 1000 basic words | CC BY-SA 4.0 |
| Hand-curated themed list (`server/games/data/themed-words.json`) | MIT (this repo) |

Wikipedia content is CC BY-SA 4.0; the words taken from it are credited in
`server/games/data/basic-words.txt`.

### Game HTTP API

| Route | Purpose |
|---|---|
| `GET /games/api/list` | Games the engine can host |
| `GET /games/api/state/<game>?owner=<id>` | Public round state (answer hidden) |
| `POST /games/api/new/<game>` | Start/restart a round (`owner`, `timerSeconds`, …) |
| `POST /games/api/pause\|resume\|end/<game>` | Control a running round |
| `GET /games/api/daily/<game>` | Daily rollover date and recent history |
| `GET /games/api/vote/state?owner=<id>` | Full vote surface: phase, ballot, tallies, term |
| `GET /POST /games/api/vote/config?owner=<id>` | Read/write a streamer's rotation |
| `POST /games/api/vote/start\|end\|cancel` | Run a ballot by hand |

### Next-Game Vote

A port of Word Tycoon's `gameVote`: each game in a streamer's **rotation** gets a
**term** (how long it stays on stream), measured in `rounds` (real wins) or
`minutes`. When the term runs out a ballot is built from the *other* games, chat
votes by typing a number, and the winner becomes the next game.

```
idle ──term expires──▶ voting ──duration up──▶ result ──grace up──▶ switch
  ▲                       │                       │                   │
  └───────no votes────────┘                       └──── autoSwitch ────┘
```

Behaviours worth knowing:

- **Nobody voted → the game does not change.** The term just restarts, so a
  quiet chat never pulls the streamer out of their game.
- **Ties** pick randomly among the leaders and set `tiebreak` so the overlay can
  say so.
- **The active game is excluded** from its own ballot; "keep playing" is added as
  an *extra* last row.
- **Least-recently-played first**, so a long rotation actually rotates.
- **One viewer, one vote**, keyed `platform:viewerId` (first wins).
- Chat votes accept `2`, `#2`, `!vote 2` or `/vote 2`, and are **never
  suppressed** — outside a voting window a bare number passes straight to the
  games.

Over the socket, an overlay/page sends `{ type: 'game-vote-state' }` for the
snapshot, `{ type: 'game-vote-start' | 'game-vote-cancel' }` to control a ballot,
and `{ type: 'game-vote', choice: '2', viewerId }` to vote. Updates arrive as
`game-vote-update` with the whole surface, so a page that reconnects mid-vote is
instantly correct.

### Vote UI

Three surfaces share one card, so a ballot can't look different depending on
where it is seen. The renderer is `public/hangstream-vote-card.js` and the
styling is `public/hangstream-vote-card.css`; both are built from the site's
existing tokens (`--panel`, `--border`, `--accent`, `--good`) so the card
inherits each page's dark/light theme.

| Surface | Where | Behaviour |
|---|---|---|
| Streamer dashboard | `/streamer` → "Next-Game Vote" | Tick the games on the rotation, set each one's term (rounds or minutes), vote length, ballot size. Saves to `/games/api/vote/config`. "Preview ballot" opens a real ballot. |
| OBS overlay | `/overlay/<streamer>` | Bottom-right card, read-only. Viewers vote in chat; the overlay just renders. |
| Viewer game page | `/spelling-bee` sidebar | Tappable rows — a tap sends the same vote a chat number would, deduped per browser. |

A rotation needs at least two games. If the streamer has not picked a current
game, the first rotation entry is treated as active so the term still runs down.

### Tests

```bash
npm test              # unit: engine, games, vote, storage
npm run smoke         # HTTP + WebSocket smoke test (needs a running server)
npm run smoke:vote-ui # vote surfaces + live ballot over a real socket
npm run smoke:games   # every game live over HTTP/WS + chat guesses (needs a server)
```

### Adding a game

1. Subclass `Game` from `server/games/engine.js` and implement `newRound`,
   `validate` and `getState` (see `spellingbee.js` / `wordle.js`). Override
   `submitWord` only if the game's input is not a whole word (see `hangman.js`),
   and expose an async `submitGuessAsync` only if judging is not synchronous
   (see `searchle.js`).
2. Register it in `GAME_FACTORIES` / `GAME_META` in `server/games/registry.js`,
   and add a branch to `startRound` if its round options differ.
3. Point a page at it and send `{ type: 'guess' }` over the existing WebSocket.
4. To let chat vote for it, add it to `VOTE_GAMES` in
   `public/streamer-settings.html` and `NEXT_GAME_VOTE_CHOICES` in
   `server/server.js`.

## 📁 Project Structure

- `server/` - Backend server code
  - `server.js` - Main HTTP server with WebSocket support
  - `storage.js` - Data persistence utilities
  - `twitch.js` - Twitch chat integration
  - `tiktok.js` - TikTok chat integration
  - `games/` - Server-authoritative game backend (see below)
    - `engine.js` - Shared `Game` class: round lifecycle, scoring, leaderboards
    - `registry.js` - Rooms per streamer, chat/WebSocket routing, daily rounds
    - `dictionary.js` - Word validation and the word bank
    - `rounds.js` - Round + daily-progress persistence (SQLite)
    - `game-vote.js` - "What do we play next?" chat vote (terms, ballot, switch)
    - `vote-config.js` - Per-streamer rotation persistence (SQLite)
    - `spellingbee.js` / `wordle.js` - Game rules on top of the engine
    - `hangman.js` - Letter-based round (letters or a whole-word solve)
    - `speedscramble.js` - Timed anagram round
    - `searchle.js` - Adaptive round over `server/searchle/`'s ranking engine
    - `word-policy.js` - Shared blocklist applied to answers, board words and guesses
    - `data/` - Curated word sources (themed + Wikipedia basic words)
    - `tools/` - Word-bank importers and the pool builder
- `public/` - Frontend pages
  - `hangstream-vote-card.js` / `.css` - Shared next-game vote card (all surfaces)
  - `custom-words.json` - Curated word pool (generated; hand-picked + Wikipedia)
  - `word-bank.json` - General word pool (generated; ecosystem target list)
  - `homepage.html` - Landing page
  - `index.html` - Game interface (viewer)
  - `profile.html` - User profile page
  - `leaderboard.html` - Score leaderboard
  - `streamer-settings.html` - Streamer dashboard
  - `apply.html` - Streamer application form
  - `admin.html` - Admin dashboard for approving applications
  - `overlay.html` - OBS-compatible overlay

## 🔒 Security

- **OAuth Authentication**: Uses Google OAuth for secure sign-in
- **API Key Protection**: Streamer API keys only shown to approved accounts
- **Password Hashing**: Application passwords are hashed before storage
- **Admin Dashboard**: Protected by ADMIN_PASSWORD environment variable
- **Encrypted Tokens**: OAuth tokens encrypted in storage

## 🎨 Design

- **Dark/Light Theme**: Toggle between dark and light themes across all pages
- **Consistent Color Scheme**: Unified design language throughout the application
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Clean, card-based interface with smooth animations

## 📦 Deployment (Azure)

### Which Azure product should I use?

HangStream is **one Node.js process, one SQLite file, one URL**, with
WebSockets on the same port. Two rules decide the fit:

1. **Only one instance.** Game state (rooms, rounds, scores, votes) lives in
   the process memory and in a single SQLite file. Two replicas would be two
   different games, and a WebSocket connection is tied to the instance it hit.
2. **The database must be durable.** Streamer accounts (password hashes),
   OAuth tokens, viewer profiles and scores all live in
   `data/hangstream.db`.

> **The SQLite caveat.** SQLite says not to put a database on a network
> filesystem ("Your best defense is to not use SQLite for files on a network
> filesystem" — [sqlite.org/lockingv3](https://sqlite.org/lockingv3.html)).
> Azure PaaS gives persistent volumes only on **Azure Files (SMB/NFS)** (a
> network filesystem); a **Linux VM's local disk** has real POSIX locks and is
> the one place SQLite behaves exactly as it does locally.

| Product | Fit | Notes |
| --- | --- | --- |
| **Azure Container Apps** | **Recommended for most streams** | Runs the included `Dockerfile` unchanged, built-in WebSocket support through HTTP ingress, a single public FQDN, and scale-to-zero. Pin `minReplicas`/`maxReplicas` to `1`. Put the DB and the Searchle model on an Azure Files share mounted into the container. |
| **Azure App Service for Containers** | Good | Always-warm, familiar model (deployment slots, easy custom domains). Costs more while idle. SQLite on `/home` (network-backed) has the same locking caveat. |
| **Azure Container Instances** | Only for quick tests | No revisions/rollbacks or easy ingress plumbing. Skip for a real stream. |
| **Azure Linux VM** (pm2 + nginx) | **Most robust for SQLite** | DB on a real local disk. You manage the OS, firewall and TLS. Step by step below. |

The repo includes a `Dockerfile`, `/health` for probes, and `server/db.js`
creates the `data/` directory on boot. The app reads `PORT` and `DB_PATH` from
the environment. A template lives in `azure/app.yaml`.

### Option A — Azure Container Apps (recommended)

Use the Azure CLI and `azure/app.yaml`. Replace every angle-bracketed value.

#### 0) Prerequisites
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) with the `containerapp` extension
- An Azure subscription

```bash
az login
az extension add --name containerapp --upgrade
az account set --subscription "<subscription-id>"
```

#### 1) Resource group, registry, environment
```bash
export RG=hangstream-rg
export LOCATION=canadacentral
export ACR=hangstreamacr
export ENV=hangstream-env
export APP=hangstream
export SA=hangstreamdata

az group create --name $RG --location $LOCATION
az acr create --resource-group $RG --name $ACR --sku Basic --admin-enabled true
az acr login --name $ACR
az containerapp env create --name $ENV --resource-group $RG --location $LOCATION
```

#### 2) Build and push the image
```bash
az acr build --registry $ACR --image hangstream:v1 .
```

#### 3) Persistent storage
```bash
az storage account create --name $SA --resource-group $RG --location $LOCATION --sku Standard_LRS
az storage share create --name hangstream --account-name $SA

SAKEY=$(az storage account keys list --account-name $SA --resource-group $RG --query "[0].value" -o tsv)

az containerapp env storage set \
  --name $ENV --resource-group $RG \
  --storage-name hangstreamfiles \
  --storage-type AzureFile \
  --azure-file-account-name $SA \
  --azure-file-account-key $SAKEY \
  --azure-file-share-name hangstream \
  --access-mode ReadWrite
```

#### 4) Create the app from `azure/app.yaml`
1. Get the environment ID: `az containerapp env show -n $ENV -g $RG --query id -o tsv`
2. Edit `azure/app.yaml` and replace every `<PLACEHOLDER>` (ACR, secrets like
   `SESSION_SECRET`/`TOKEN_ENCRYPTION_KEY`/`ADMIN_PASSWORD`, `APP_URL`,
   `ADMIN_EMAIL`, subscription/rg/env).
3. Create the app:

```bash
az containerapp create --name $APP --resource-group $RG --environment $ENV --yaml azure/app.yaml
```

Notes:
- `minReplicas: 1`, `maxReplicas: 1` (one instance only). Do **not** scale out.
- Ingress is external over HTTPS; WebSockets are supported. Probes use `/health`.
- `DB_PATH=/data/hangstream.db`, `SEARCHLE_MODELS_DIR=/data/searchle-models`.
- Set `TOKEN_ENCRYPTION_KEY`; if missing, OAuth tokens are stored in plaintext.

#### 5) Searchle model on the share (optional)
Build locally (Option B step 5) and upload `vectors.bin` and `index.json`
to `searchle-models/fasttext/`. Without it, `/searchle` returns "model not ready".

```bash
az storage directory create --share-name hangstream --account-name $SA --name searchle-models
az storage directory create --share-name hangstream --account-name $SA --name searchle-models/fasttext
az storage file upload --share-name hangstream --account-name $SA \
  --source server/searchle/data/models/fasttext/vectors.bin \
  --path searchle-models/fasttext/vectors.bin
az storage file upload --share-name hangstream --account-name $SA \
  --source server/searchle/data/models/fasttext/index.json \
  --path searchle-models/fasttext/index.json
```

#### 6) Custom domain and HTTPS
```bash
az containerapp env certificate create --name $ENV --resource-group $RG --hostname yourdomain.com
az containerapp update --name $APP --resource-group $RG --hostname yourdomain.com
```
Update `APP_URL` and the OAuth redirect URIs in Google/Spotify/TikTok/Twitch.

#### 7) Deploy updates, logs, backups
```bash
az acr build --registry $ACR --image hangstream:v1 .
az containerapp update --name $APP --resource-group $RG --image $ACR.azurecr.io/hangstream:v1

az containerapp logs show --name $APP --resource-group $RG --follow

az storage file download --share-name hangstream --account-name $SA \
  --path hangstream.db --dest ./hangstream-backup-$(date +%Y%m%d).db
```

The SQLite DB is on Azure Files (a network filesystem) — back it up often and keep `minReplicas` at 1.

---

### Option B — Azure Linux VM (pm2 + nginx)

HangStream is a single Node.js process with a SQLite database, so a Linux VM
keeps everything in one place with a real local disk.

#### 1) Create the VM
- **Image**: Ubuntu 22.04 or 24.04 LTS
- **Size**: anything with **2 GB+ RAM** (4 GB lets you build the Searchle model on the VM instead of copying it)
- **Networking**: allow inbound HTTP/HTTPS in the NSG — portal: *Networking → Add inbound security rule*; or CLI: `az vm open-port --resource-group <rg> --name <vm> --port 80`

#### 2) Install the basics
```bash
sudo apt update
sudo apt install -y git python3 make g++     # build tools for native npm modules
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 3) Clone and configure
```bash
cd ~
git clone <your-repo-url> HangStream
cd HangStream
cp .env.example .env
nano .env
npm install
```

#### 4) Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV=production` | ✅ | production mode |
| `APP_URL` | ✅ | public URL, e.g. `https://yourdomain.com` — must match the OAuth redirect URIs |
| `SESSION_SECRET` | ✅ | random string for session cookies |
| `TOKEN_ENCRYPTION_KEY` | ✅ | random string used to encrypt stored OAuth tokens |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | admin dashboard login |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google sign-in |
| `SMTP_*` | optional | email notifications |
| `SPOTIFY_*` / `TIKTOK_*` / `TWITCH_*` | optional | music requests and chat — degrade gracefully when absent |
| `STRIPE_*` | optional | payments |

Generate secrets with `openssl rand -hex 32`. Once you have a real domain,
update each provider's redirect URIs to that origin.

#### 5) Build the Searchle model (one time)
Searchle uses FastText embeddings (~125 MB); the model is **not** in git.
```bash
node server/searchle/tools/download-fasttext.js   # ~2.2 GB
node server/searchle/tools/build-model.js fasttext
node server/searchle/tools/convert-float16.js fasttext
rm -rf server/searchle/data/fasttext
```
Needs ~2.5 GB disk and ~1 GB RAM. Output in `server/searchle/data/models/fasttext/`
(gitignored). Skipping is safe — `/searchle` returns 503 "model not ready".
Shortcut: build locally and `scp -r server/searchle/data/models <vm>:/home/<user>/HangStream/server/searchle/data/`.

#### 6) Start with pm2
```bash
npm install -g pm2
pm2 start npm --name hangstream -- start
pm2 save
pm2 startup systemd    # run the command it prints
```
Check `pm2 logs hangstream`, open `http://<vm-ip>:8080`.

#### 7) (Recommended) nginx + HTTPS
```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/hangstream
```
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/hangstream /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
Set `APP_URL=https://yourdomain.com` in `.env` and update the OAuth redirect
URIs in Google/Spotify/TikTok/Twitch.


## 🚀 Shipping an update

SSH in and run:

```bash
cd ~/HangStream
git pull origin main
npm install          # only needed when package.json changed
pm2 restart hangstream
```

Verify it came back up:

```bash
pm2 status hangstream
curl -fsS http://127.0.0.1:8080/game-count/hangman   # healthy: {"count":0}
```

Prefer it automated? Pushes to `main` can deploy themselves via the GitHub
Actions SSH workflow — recreate `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure VM

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          script: |
            cd ~/HangStream
            git pull origin main
            npm install
            pm2 restart hangstream
```

(Requires repo secrets `VM_HOST`, `VM_USER`, `VM_SSH_KEY` with a deploy key that
can pull from GitHub.)

## 💾 Data & backups

- All application state lives in `data/hangstream.db` (SQLite). It is not in git
  and `git pull`/`npm install`/`pm2 restart` never touch it — but it sits on the
  VM's disk, so **back it up** (recreating the VM loses it):

  ```bash
  sqlite3 ~/HangStream/data/hangstream.db ".backup '/backups/hangstream-$(date +%F).db'"
  ```

- The Searchle model needs no backup — rerun the three build commands from
  Deployment step 5 whenever it's missing.

## 🐛 Known Issues

- The `tiktok-live-connector` dependency was upgraded to v2.5 (see
  `server/tiktok.js`). v2.5 is ESM-only and moved the old EventEmitter-style
  client to the `tiktok-live-connector/legacy` entry point, which is what
  HangStream uses. It also renamed the `connect` event to `connected`, dropped
  `streamStart`, and now refuses to connect while the streamer is offline — so
  the manager waits for the streamer to go live instead of dropping the watch.
  `npm audit` reports **0 vulnerabilities**.

## 📄 License

This project is open source and available for modification and distribution.

Third-party material it ships:

| Material | Licence |
|---|---|
| [Word Tycoon ecosystem](https://github.com/johnrstanley11-gif/word-tycoon-ecosystem) — game engine design, shared word bank, blocklist | MIT |
| Wikipedia [list of 1000 basic words](https://simple.wikipedia.org/wiki/Wikipedia:List_of_1000_basic_words) | CC BY-SA 4.0 |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support or questions, please open an issue on the GitHub repository.
