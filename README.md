# HangStream

Lightweight WebSocket demo for live multiplayer interactions.

## Deploy to Google Cloud Run

The app already listens on `process.env.PORT`, so it can run directly in Cloud Run.

1. Build and deploy from the repo root:

```bash
gcloud run deploy hangstream \
	--source . \
	--region us-central1 \
	--allow-unauthenticated \
	--set-env-vars GOOGLE_CLIENT_ID=YOUR_ID,GOOGLE_CLIENT_SECRET=YOUR_SECRET,GOOGLE_OWNER_REDIRECT_URI=YOUR_CLOUD_RUN_URL/oauth/google/callback,GOOGLE_VIEWER_REDIRECT_URI=YOUR_CLOUD_RUN_URL/auth/google/callback
```

2. After deployment, copy the service URL and update your Google OAuth redirect URI to:

```text
https://YOUR_SERVICE_URL/oauth/google/callback
https://YOUR_SERVICE_URL/auth/google/callback
```

3. Re-deploy any time you change the redirect URI or OAuth settings.

4. If you use Spotify, TikTok, or Twitch auth, add the matching environment variables in the Cloud Run service settings before testing those flows.

## Deploy to DigitalOcean App Platform

You can deploy directly from this GitHub repo to DigitalOcean App Platform. App Platform builds with Node.js and supports WebSockets.

1. Push your repository to GitHub (see earlier steps) and note the repo URL.

2. UI method (recommended):
	- Go to DigitalOcean → Apps → Create App → connect GitHub → select this repo and branch.
	- Service settings: Web Service, Run command `npm start`, HTTP port `8080`, enable WebSockets.
	- Add environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OWNER_REDIRECT_URI` (set to `https://<your-app>.ondigitalocean.app/oauth/google/callback`), and `GOOGLE_VIEWER_REDIRECT_URI` (set to `https://<your-app>.ondigitalocean.app/auth/google/callback`).
	- Deploy and note the service URL.

3. CLI method (optional): install `doctl`, authenticate, then create from the included spec file:

```bash
# install doctl (Windows)
winget install -e --id DigitalExperience.doctl

# authenticate
doctl auth init

# create app from spec (edit .do/app.yaml with your repo/url and secrets first)
doctl apps create --spec .do/app.yaml
```

4. After deployment, update your Google OAuth client Authorized Redirect URIs / Origins to include your DigitalOcean service URL.

5. Test sign-in and verify the `viewer_id` cookie, the streamer OAuth popups, and `/scores` persistence.

## Quick start

1. From the `HangStream` folder run:

```bash
npm install
npm start
```

2. Open `http://localhost:8080` in a browser.


3. Type messages to test broadcasting between multiple browser windows.

## Spotify music requests

To use `!play <song>` from chat:

- Set `SPOTIFY_CLIENT_ID`
- Set `SPOTIFY_CLIENT_SECRET`
- Set `SPOTIFY_REDIRECT_URI` to `http://localhost:8080/oauth/spotify/callback`
- Log in with Spotify on the streamer settings page
- Keep a Spotify Premium playback device active on the streamer machine

## Streamer settings

Open `http://localhost:8080/streamer` after starting the server. That page is the production-facing admin entry point for OAuth setup and deployment checks.
