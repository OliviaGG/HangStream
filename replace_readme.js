const fs=require('fs');
const p='C:/Users/Olivia Garcia-Godos/HangStream/README.md';
let s=fs.readFileSync(p,'utf8');
const needle='Deployment (Azure)';
let a=s.indexOf(needle);
while(a>0 && s[a-1]!=='\n') a--;
const b=s.indexOf('\n## ', a + needle.length);
const n = `## \ud83d\udce6 Deployment (Azure)

### Which Azure product should I use?

HangStream is **one Node.js process, one SQLite file, one URL**, with
WebSockets on the same port. Two rules decide the fit:

1. **Only one instance.** Game state (rooms, rounds, scores, votes) lives in
   the process memory and in a single SQLite file. Two replicas would be two
   different games, and a WebSocket connection is tied to the instance it hit.
2. **The database must be durable.** Streamer accounts (password hashes),
   OAuth tokens, viewer profiles and scores all live in
   \`data/hangstream.db\`.

> **The SQLite caveat.** SQLite says not to put a database on a network
> filesystem ("Your best defense is to not use SQLite for files on a network
> filesystem" — [sqlite.org/lockingv3](https://sqlite.org/lockingv3.html)).
> Azure PaaS gives persistent volumes only on **Azure Files (SMB/NFS)** (a
> network filesystem); a **Linux VM's local disk** has real POSIX locks and is
> the one place SQLite behaves exactly as it does locally.

| Product | Fit | Notes |
| --- | --- | --- |
| **Azure Container Apps** | **Recommended for most streams** | Runs the included \`Dockerfile\` unchanged, built-in WebSocket support through HTTP ingress, a single public FQDN, and scale-to-zero. Pin \`minReplicas\`/\`maxReplicas\` to \`1\`. Put the DB and the Searchle model on an Azure Files share mounted into the container. |
| **Azure App Service for Containers** | Good | Always-warm, familiar model (deployment slots, easy custom domains). Costs more while idle. SQLite on \`/home\` (network-backed) has the same locking caveat. |
| **Azure Container Instances** | Only for quick tests | No revisions/rollbacks or easy ingress plumbing. Skip for a real stream. |
| **Azure Linux VM** (pm2 + nginx) | **Most robust for SQLite** | DB on a real local disk. You manage the OS, firewall and TLS. Step by step below. |

The repo includes a \`Dockerfile\`, \`/health\` for probes, and \`server/db.js\`
creates the \`data/\` directory on boot. The app reads \`PORT\` and \`DB_PATH\` from
the environment. A template lives in \`azure/app.yaml\`.

### Option A — Azure Container Apps (recommended)

Use the Azure CLI and \`azure/app.yaml\`. Replace every angle-bracketed value.

#### 0) Prerequisites
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) with the \`containerapp\` extension
- An Azure subscription

\`\`\`bash
az login
az extension add --name containerapp --upgrade
az account set --subscription "<subscription-id>"
\`\`\`

#### 1) Resource group, registry, environment
\`\`\`bash
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
\`\`\`

#### 2) Build and push the image
\`\`\`bash
az acr build --registry $ACR --image hangstream:v1 .
\`\`\`

#### 3) Persistent storage
\`\`\`bash
az storage account create --name $SA --resource-group $RG --location $LOCATION --sku Standard_LRS
az storage share create --name hangstream --account-name $SA

SAKEY=$(az storage account keys list --account-name $SA --resource-group $RG --query "[0].value" -o tsv)

az containerapp env storage set \\
  --name $ENV --resource-group $RG \\
  --storage-name hangstreamfiles \\
  --storage-type AzureFile \\
  --azure-file-account-name $SA \\
  --azure-file-account-key $SAKEY \\
  --azure-file-share-name hangstream \\
  --access-mode ReadWrite
\`\`\`

#### 4) Create the app from \`azure/app.yaml\`
1. Get the environment ID: \`az containerapp env show -n $ENV -g $RG --query id -o tsv\`
2. Edit \`azure/app.yaml\` and replace every \`<PLACEHOLDER>\` (ACR, secrets like
   \`SESSION_SECRET\`/\`TOKEN_ENCRYPTION_KEY\`/\`ADMIN_PASSWORD\`, \`APP_URL\`,
   \`ADMIN_EMAIL\`, subscription/rg/env).
3. Create the app:

\`\`\`bash
az containerapp create --name $APP --resource-group $RG --environment $ENV --yaml azure/app.yaml
\`\`\`

Notes:
- \`minReplicas: 1\`, \`maxReplicas: 1\` (one instance only). Do **not** scale out.
- Ingress is external over HTTPS; WebSockets are supported. Probes use \`/health\`.
- \`DB_PATH=/data/hangstream.db\`, \`SEARCHLE_MODELS_DIR=/data/searchle-models\`.
- Set \`TOKEN_ENCRYPTION_KEY\`; if missing, OAuth tokens are stored in plaintext.

#### 5) Searchle model on the share (optional)
Build locally (Option B step 5) and upload \`vectors.bin\` and \`index.json\`
to \`searchle-models/fasttext/\`. Without it, \`/searchle\` returns "model not ready".

\`\`\`bash
az storage directory create --share-name hangstream --account-name $SA --name searchle-models
az storage directory create --share-name hangstream --account-name $SA --name searchle-models/fasttext
az storage file upload --share-name hangstream --account-name $SA \\
  --source server/searchle/data/models/fasttext/vectors.bin \\
  --path searchle-models/fasttext/vectors.bin
az storage file upload --share-name hangstream --account-name $SA \\
  --source server/searchle/data/models/fasttext/index.json \\
  --path searchle-models/fasttext/index.json
\`\`\`

#### 6) Custom domain and HTTPS
\`\`\`bash
az containerapp env certificate create --name $ENV --resource-group $RG --hostname yourdomain.com
az containerapp update --name $APP --resource-group $RG --hostname yourdomain.com
\`\`\`
Update \`APP_URL\` and the OAuth redirect URIs in Google/Spotify/TikTok/Twitch.

#### 7) Deploy updates, logs, backups
\`\`\`bash
az acr build --registry $ACR --image hangstream:v1 .
az containerapp update --name $APP --resource-group $RG --image $ACR.azurecr.io/hangstream:v1

az containerapp logs show --name $APP --resource-group $RG --follow

az storage file download --share-name hangstream --account-name $SA \\
  --path hangstream.db --dest ./hangstream-backup-$(date +%Y%m%d).db
\`\`\`

The SQLite DB is on Azure Files (a network filesystem) — back it up often and keep \`minReplicas\` at 1.

---

### Option B — Azure Linux VM (pm2 + nginx)

HangStream is a single Node.js process with a SQLite database, so a Linux VM
keeps everything in one place with a real local disk.

#### 1) Create the VM
- **Image**: Ubuntu 22.04 or 24.04 LTS
- **Size**: anything with **2 GB+ RAM** (4 GB lets you build the Searchle model on the VM instead of copying it)
- **Networking**: allow inbound HTTP/HTTPS in the NSG — portal: *Networking → Add inbound security rule*; or CLI: \`az vm open-port --resource-group <rg> --name <vm> --port 80\`

#### 2) Install the basics
\`\`\`bash
sudo apt update
sudo apt install -y git python3 make g++     # build tools for native npm modules
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
\`\`\`

#### 3) Clone and configure
\`\`\`bash
cd ~
git clone <your-repo-url> HangStream
cd HangStream
cp .env.example .env
nano .env
npm install
\`\`\`

#### 4) Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| \`NODE_ENV=production\` | ✅ | production mode |
| \`APP_URL\` | ✅ | public URL, e.g. \`https://yourdomain.com\` — must match the OAuth redirect URIs |
| \`SESSION_SECRET\` | ✅ | random string for session cookies |
| \`TOKEN_ENCRYPTION_KEY\` | ✅ | random string used to encrypt stored OAuth tokens |
| \`ADMIN_EMAIL\` / \`ADMIN_PASSWORD\` | ✅ | admin dashboard login |
| \`GOOGLE_CLIENT_ID\` / \`GOOGLE_CLIENT_SECRET\` | ✅ | Google sign-in |
| \`SMTP_*\` | optional | email notifications |
| \`SPOTIFY_*\` / \`TIKTOK_*\` / \`TWITCH_*\` | optional | music requests and chat — degrade gracefully when absent |
| \`STRIPE_*\` | optional | payments |

Generate secrets with \`openssl rand -hex 32\`. Once you have a real domain,
update each provider's redirect URIs to that origin.

#### 5) Build the Searchle model (one time)
Searchle uses FastText embeddings (~125 MB); the model is **not** in git.
\`\`\`bash
node server/searchle/tools/download-fasttext.js   # ~2.2 GB
node server/searchle/tools/build-model.js fasttext
node server/searchle/tools/convert-float16.js fasttext
rm -rf server/searchle/data/fasttext
\`\`\`
Needs ~2.5 GB disk and ~1 GB RAM. Output in \`server/searchle/data/models/fasttext/\`
(gitignored). Skipping is safe — \`/searchle\` returns 503 "model not ready".
Shortcut: build locally and \`scp -r server/searchle/data/models <vm>:/home/<user>/HangStream/server/searchle/data/\`.

#### 6) Start with pm2
\`\`\`bash
npm install -g pm2
pm2 start npm --name hangstream -- start
pm2 save
pm2 startup systemd    # run the command it prints
\`\`\`
Check \`pm2 logs hangstream\`, open \`http://<vm-ip>:8080\`.

#### 7) (Recommended) nginx + HTTPS
\`\`\`bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/hangstream
\`\`\`
\`\`\`nginx
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
\`\`\`
\`\`\`bash
sudo ln -s /etc/nginx/sites-available/hangstream /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
\`\`\`
Set \`APP_URL=https://yourdomain.com\` in \`.env\` and update the OAuth redirect
URIs in Google/Spotify/TikTok/Twitch.

`;
fs.writeFileSync(p, s.slice(0,a) + n + s.slice(b), 'utf8');
console.log('ok');
