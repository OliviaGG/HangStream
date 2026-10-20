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
- Node.js (version 18 or higher — see `engines` in `package.json`)
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

## 📁 Project Structure

- `server/` - Backend server code
  - `server.js` - Main HTTP server with WebSocket support
  - `storage.js` - Data persistence utilities
  - `twitch.js` - Twitch chat integration
  - `tiktok.js` - TikTok chat integration
- `public/` - Frontend pages
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

HangStream is a single Node.js process with a SQLite database, so the simplest fit
on Azure is a **Linux VM managed with pm2** — which is how this project deploys.
What it needs:

- Node.js ≥ 18 (Node 20 recommended)
- ~512 MB RAM to run; ~1 GB RAM if you build the Searchle model on the VM
- Ports **80/443** open (or 8080 directly if you skip nginx)
- The server listens on `process.env.PORT || 8080` — every page, API, WebSocket,
  and overlay is served from this one process

> **Why not Azure App Service?** It can work (a `Dockerfile` is included for
> containers too), but the SQLite file, native `sqlite3` module, always-on
> WebSockets, and the Searchle model build are all friction there. A VM keeps
> everything in one place.

### 1. Create the VM

- **Image**: Ubuntu 22.04 or 24.04 LTS
- **Size**: anything with **2 GB+ RAM** (4 GB lets you build the Searchle model
  on the VM instead of copying it)
- **Networking**: allow inbound HTTP/HTTPS in the NSG — portal: *Networking →
  Add inbound security rule*; or CLI:
  `az vm open-port --resource-group <rg> --name <vm> --port 80`

### 2. Install the basics

```bash
sudo apt update
sudo apt install -y git python3 make g++     # build tools for native npm modules
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Clone and configure

```bash
cd ~
git clone <your-repo-url> HangStream
cd HangStream
cp .env.example .env
nano .env          # see the table below
npm install
```

### 4. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV=production` | ✅ | production mode |
| `APP_URL` | ✅ | public URL, e.g. `https://yourdomain.com` — must match the OAuth redirect URIs |
| `SESSION_SECRET` | ✅ | random string for session cookies |
| `TOKEN_ENCRYPTION_KEY` | ✅ | random string used to encrypt stored OAuth tokens |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | admin dashboard login |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google sign-in (all auth runs through it) |
| `SMTP_*` | optional | email notifications for applications |
| `SPOTIFY_*` / `TIKTOK_*` / `TWITCH_*` | optional | music requests and chat integration — features degrade gracefully when absent |
| `STRIPE_*` | optional | payments |

Generate secrets with `openssl rand -hex 32`. Full variable list with redirect-URI
formats is in "Getting Started" above — once the site has a real domain, update
each provider's redirect URIs to that origin.

### 5. Build the Searchle model (one time)

Searchle ranks guesses with FastText embeddings (~125 MB); the model is **not**
in git. On the VM:

```bash
node server/searchle/tools/download-fasttext.js   # ~2.2 GB download into server/searchle/data/fasttext/
node server/searchle/tools/build-model.js fasttext
node server/searchle/tools/convert-float16.js fasttext
rm -rf server/searchle/data/fasttext              # reclaim the ~2.2 GB raw vectors
```

- Needs ~2.5 GB free disk and ~1 GB RAM while building
- Output lands in `server/searchle/data/models/fasttext/` (gitignored — survives
  `git pull`, no backup needed, just rebuildable)
- Skipping this is safe: the whole site runs normally, `/searchle` just returns
  503 "model not ready"
- Shortcut: build on your own machine and copy the result over instead:
  `scp -r server/searchle/data/models <vm>:/home/<user>/HangStream/server/searchle/data/`
- After a server restart, the first Searchle guess takes ~10 s while the model
  loads into RAM (~400 MB)

### 6. Start with pm2

```bash
pm2 start npm --name hangstream -- start
pm2 save
pm2 startup systemd    # run the command it prints, so pm2 restarts on reboot
```

Check `pm2 logs hangstream`, then open `http://<vm-ip>:8080`.

### 7. (Recommended) nginx + HTTPS

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

Finally set `APP_URL=https://yourdomain.com` in `.env` and update the OAuth
redirect URIs at Google/Spotify/TikTok/Twitch to the https origins.

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

- Dependencies in `tiktok-live-connector` have known security vulnerabilities. Run `npm audit fix --force` to update to a safer version (may require code changes).

## 📄 License

This project is open source and available for modification and distribution.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support or questions, please open an issue on the GitHub repository.
