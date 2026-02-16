# h1-watcher

> Monitor newly launched public bug bounty programs on HackerOne. Get alerts via Telegram and Discord. Runs on GitHub Actions every 15 minutes.

## Features

- 🔍 Monitors HackerOne for new public programs via official API
- 🔔 Alerts via Telegram bot and/or Discord webhook
- 🗄️ JSON-based state persistence (tracked in git)
- ⏰ Runs on GitHub Actions cron (every 15 min)
- 🔒 Secrets never committed or logged
- 🧩 Pluggable architecture (alerters, recon hooks)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/<your-username>/h1-watcher.git
cd h1-watcher
npm install
```

### 2. Create a HackerOne API Token

1. Log into [HackerOne](https://hackerone.com)
2. Go to **Settings → API Token** (or **Organization Settings → API Tokens** for org accounts)
3. Create a new API token
4. Note the **API Token Identifier** (username) and **API Token Value** (token)

> **Minimum permissions:** Read access to public programs. No write permissions needed.

### 3. Add GitHub Repository Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret Name | Description | Required |
|---|---|---|
| `H1_API_USERNAME` | HackerOne API token identifier | ✅ Yes |
| `H1_API_TOKEN` | HackerOne API token value | ✅ Yes |
| `GH_PUSH_TOKEN` | GitHub PAT with `repo` scope (to commit state back) | ✅ Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) | Optional |
| `TELEGRAM_CHAT_ID` | Telegram chat/group ID to send alerts | Optional |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL | Optional |

> **Note:** At least one alert channel (Telegram or Discord) should be configured to receive notifications.

### 4. Create `GH_PUSH_TOKEN`

1. Go to GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Create a token with:
   - **Repository access:** Only this repository
   - **Permissions:** Contents → Read and write
3. Add it as the `GH_PUSH_TOKEN` secret

### 5. Enable the Workflow

The GitHub Actions workflow runs automatically on the cron schedule. You can also trigger it manually:

1. Go to **Actions → h1-watcher → Run workflow**

## Local Testing

### With Real API (requires credentials)

```bash
export H1_API_USERNAME="your-api-username"
export H1_API_TOKEN="your-api-token"
export TELEGRAM_BOT_TOKEN="optional"
export TELEGRAM_CHAT_ID="optional"
export DISCORD_WEBHOOK_URL="optional"

node src/watcher.js
```

### Run Unit Tests

```bash
npm test
```

### Simulated Run (no API credentials needed)

The test suite includes integration-style tests that simulate:

1. **First run** — empty DB → detects all programs → sends alerts → creates DB
2. **Steady state** — no new programs → no alerts sent
3. **New program detected** — API returns new program → alert sent → DB updated

```bash
npm test -- --reporter=verbose
```

## Architecture

```
h1-watcher/
├── src/
│   ├── watcher.js      # Entry point: orchestrates the pipeline
│   ├── h1-client.js    # HackerOne API client (Basic Auth, pagination, retry)
│   ├── db.js           # JSON file-based state persistence
│   ├── alerter.js      # Telegram + Discord notifications
│   ├── recon.js        # Optional recon trigger (Phase 3)
│   └── logger.js       # Structured logging with secret masking
├── state/
│   └── db.json         # Tracked program state (committed to repo)
├── tests/              # Vitest unit + integration tests
├── .github/workflows/
│   ├── cron.yml        # Main watcher schedule (every 15 min)
│   └── recon-dispatch.yml  # Optional recon pipeline trigger
├── SECURITY.md         # Security policy and incident checklist
└── README.md
```

## How It Works

1. **Fetch** — Queries HackerOne API for all programs, paginates through results
2. **Filter** — Keeps only `state === "public_mode"` programs
3. **Diff** — Compares against known programs in `state/db.json`
4. **Alert** — Sends a single summary message to configured channels (Telegram/Discord)
5. **Persist** — Saves new programs to DB, commits back to repo via GitHub Actions

## Persistence Options

### Option A: Git-based (Default MVP)

State is committed back to the repository after each run. This is the simplest approach and works well for low-volume monitoring.

### Option B: External Storage (Production)

For production use, consider an external store:

1. **S3 Bucket** — Create a restricted S3 bucket, add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as secrets
2. **Managed Database** — Use a small PostgreSQL/SQLite on a managed service

To switch, modify `src/db.js` to use your preferred storage backend. The `load()` and `save()` interface remains the same.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `H1_API_USERNAME` | — | HackerOne API token identifier |
| `H1_API_TOKEN` | — | HackerOne API token value |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID for alerts |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook URL |
| `AUTO_RECON` | `false` | Enable automatic recon dispatch |
| `DB_PATH` | `state/db.json` | Path to state database file |
| `LOG_LEVEL` | `info` | Log level: `error`, `warn`, `info` |

## License

MIT
