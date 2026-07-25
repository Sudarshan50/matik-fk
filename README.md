# Matik Control

Multi-token Matiks automation with a secured admin portal: schedule/fire Playwright bots in Docker, track streaks, and browse elaborative run logs.

## Security (read before deploying)

This repo is meant to be public. **Never commit:**

- `.env` / `.credentials.local`
- `tokens.txt` (Matiks refresh tokens)
- `logs/`, `data/`

Copy `.env.example` → `.env` and set strong values (`ADMIN_PASSWORD` ≥ 16 chars, random DB password, session + bot tokens). Production requires explicit secrets (no weak defaults).

## Quick start (Docker Compose)

```bash
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD, ADMIN_*, etc.

# optional: add refresh tokens (one per line)
cp tokens.txt.example tokens.txt
# edit tokens.txt

npm run stack:up
# Admin UI → http://localhost:8787
```

Useful commands:

```bash
npm run stack:logs    # follow admin + db
npm run stack:down    # stop
```

Stack services:

| Service     | Role                                      |
|------------|--------------------------------------------|
| `db`       | Postgres                                   |
| `admin`    | API + built React UI                       |
| `bot-image`| Builds shared `matik-fk-bot:latest` image  |

## Production VM

1. Install Docker Engine + Compose plugin on the VM.
2. Clone this repo (public).
3. Create `.env` from `.env.example` with **new** production secrets (do not reuse local ones).
4. Put refresh tokens only in `tokens.txt` on the server (`chmod 600`).
5. Open / reverse-proxy port `8787` (prefer HTTPS + `ADMIN_COOKIE_SECURE=true`).
6. Start:

```bash
npm run stack:up
docker compose ps
curl -fsS http://127.0.0.1:8787/api/health
```

7. Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.
8. Set per-user schedules on **Control**, confirm streaks on **Streaks**.

Firewall tip: do not expose Postgres (`55432`) publicly; keep it bound to localhost or the Docker network.

## Portal

- **Control** — tokens, per-user schedules, fire all / fire one  
- **Streaks** — board + history  
- **Logs** — by user or by run  

## Architecture

```
src/bot/       Playwright worker
src/matiks/    Matiks GraphQL client
server/        Admin API (auth, schedule, fire, logs)
admin/src/     React UI (built inside Dockerfile.admin)
```

## Local single bot (optional)

```bash
REFRESH_TOKEN=xxx MATCH_LOOPS=1 npm run bot
```

Requires Playwright browsers if not using the Docker bot image.
