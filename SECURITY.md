# Security Policy

## Token Handling

### Principles

1. **No secrets in code** — All secrets are read from environment variables at runtime
2. **Fail fast** — The watcher exits immediately if required credentials are missing
3. **Secret masking** — All log output scrubs known secret values before printing
4. **GitHub Actions masking** — Uses `::add-mask::` to redact secrets from CI logs
5. **Least privilege** — Each token requests only the minimum permissions needed

### Token Inventory

| Token | Purpose | Minimum Permissions | Stored In |
|---|---|---|---|
| `H1_API_USERNAME` | HackerOne API authentication | Read-only API access | GitHub Secret |
| `H1_API_TOKEN` | HackerOne API authentication | Read-only API access | GitHub Secret |
| `GH_PUSH_TOKEN` | Commit state back to repo | Contents: read/write (this repo only) | GitHub Secret |
| `TELEGRAM_BOT_TOKEN` | Send Telegram notifications | Send messages to configured chat | GitHub Secret |
| `TELEGRAM_CHAT_ID` | Telegram target chat | N/A (identifier, not sensitive) | GitHub Secret |
| `DISCORD_WEBHOOK_URL` | Send Discord notifications | Post messages to channel | GitHub Secret |

## Rotation Policy

### Recommended Schedule

- **HackerOne API tokens** — Rotate every **90 days**
- **GitHub PAT (`GH_PUSH_TOKEN`)** — Rotate every **90 days**, set expiration dates
- **Telegram Bot Token** — Rotate if compromised (no expiry by default)
- **Discord Webhook URL** — Regenerate if compromised

### How to Rotate

#### HackerOne API Token
1. Log into HackerOne → **Settings → API Token**
2. Generate a new token
3. Update `H1_API_USERNAME` and `H1_API_TOKEN` in GitHub Secrets
4. Verify by manually triggering the workflow
5. Revoke the old token in HackerOne

#### GitHub PAT (`GH_PUSH_TOKEN`)
1. Go to GitHub → **Settings → Developer settings → Personal access tokens**
2. Generate a new fine-grained token with:
   - Repository: only this repo
   - Permissions: Contents → Read and write
3. Update `GH_PUSH_TOKEN` in GitHub Secrets
4. Verify by manually triggering the workflow
5. Delete the old token

#### Telegram Bot Token
1. Message [@BotFather](https://t.me/BotFather) → `/revoke`
2. Generate a new token via `/newbot` or `/token`
3. Update `TELEGRAM_BOT_TOKEN` in GitHub Secrets

#### Discord Webhook URL
1. Go to Discord → Channel Settings → Integrations → Webhooks
2. Delete the old webhook
3. Create a new webhook
4. Update `DISCORD_WEBHOOK_URL` in GitHub Secrets

## Incident Response

### If a Token Is Leaked

**Immediate actions (within 15 minutes):**

1. **Revoke the compromised token immediately**
   - HackerOne: Settings → API Tokens → Delete
   - GitHub PAT: Settings → Developer settings → Delete token
   - Telegram: `/revoke` via BotFather
   - Discord: Delete webhook in channel settings

2. **Rotate the token** (see rotation steps above)

3. **Check for unauthorized access**
   - HackerOne: Review API audit logs
   - GitHub: Check repo activity, Actions history
   - Telegram: Check bot message history
   - Discord: Check webhook delivery logs

4. **Audit the leak source**
   - Check git history for accidentally committed secrets: `git log --all -p | grep -i "token\|secret\|key"`
   - Check CI logs for leaked values
   - If found in a commit, use git filter-branch or BFG to remove it

5. **Update secrets in GitHub Settings**

### If the State File (`db.json`) Is Corrupted

1. The watcher automatically handles corrupt/invalid JSON by starting fresh
2. To manually reset: replace `state/db.json` with `{"programs": {}, "last_run": null}`
3. Note: A reset means the next run will treat all existing programs as "new" and send alerts

## Security Checklist

- [x] Secrets stored in GitHub repository secrets, not in code
- [x] Environment variables fail-fast validation on startup
- [x] All log output passes through secret masking filter
- [x] GitHub Actions uses `::add-mask::` for secret redaction
- [x] `GH_PUSH_TOKEN` uses fine-grained PAT with minimal scope
- [x] Workflow permissions set to `contents: write` (least privilege)
- [x] Commit author set to bot account, not personal
- [x] `.gitignore` excludes `.env` files
- [x] No secrets written to disk or state files
- [x] Rate limiting and backoff prevent API abuse
