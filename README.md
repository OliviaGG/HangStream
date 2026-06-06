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
- Node.js (version 14 or higher)
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

## 📦 Deployment

### Azure App Service
1. Build and push to Azure Container Registry
2. Set environment variables (see `.env.example`)
3. Mount Azure Files to persist data
4. Update OAuth redirect URIs

### Google Cloud Run
1. Run `gcloud run deploy` with appropriate flags
2. Set environment variables in Cloud Run service
3. Update Google OAuth redirect URIs

### DigitalOcean App Platform
1. Connect GitHub repository
2. Configure as Web Service with WebSockets enabled
3. Set environment variables
4. Deploy and test

## 🐛 Known Issues

- Dependencies in `tiktok-live-connector` have known security vulnerabilities. Run `npm audit fix --force` to update to a safer version (may require code changes).

## 📄 License

This project is open source and available for modification and distribution.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support or questions, please open an issue on the GitHub repository.
