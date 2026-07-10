# Ovie / HUD local cockpit

## Canonical routes

The Ovie menu-bar/operator surface is the web app's `/hud` route. It requires an authenticated admin session.

The wallboard/kiosk surface is `/hud-tv?kiosk=...`. It requires `HUD_KIOSK_TOKEN`; without a token it intentionally renders a 200 access-help page rather than the cockpit. Do not put the token in source control or paste it into logs.

For the local dev server, the deterministic URLs are:

- Admin: `http://127.0.0.1:3100/hud`
- Kiosk: `http://127.0.0.1:3100/hud-tv?kiosk=<HUD_KIOSK_TOKEN>`

- Port `3100` is the launcher default so it reuses the existing web dev server on this Mac when available. If `3100` is occupied by an unrelated service, override it with `OVIE_HUD_PORT=3110` (or another free port).

## Start / verify

From the repository root:

```bash
./scripts/ovie-hud.sh start
./scripts/ovie-hud.sh health
./scripts/ovie-hud.sh status
./scripts/ovie-hud.sh open
```

`start` first probes the configured port and reuses a reachable server; it never kills an existing process. If no server is reachable, it starts the repo's supported `pnpm run dev:web:fast` wrapper with the pinned Doppler `jovie-web/dev` scope and E2E-safe local auth defaults.

For a real kiosk cockpit, run the launcher in a shell with the dev secret available through Doppler (or an already configured environment), for example:

```bash
doppler run --project jovie-web --config dev -- ./scripts/ovie-hud.sh start
```

The script confirms that kiosk mode is configured without printing the secret. `health` verifies the kiosk route returns HTTP 200 and contains HUD content; it also prints the admin URL and the exact process log path if startup is needed.

## Existing process discovery

The launcher is safe to run while another worktree owns port 3100. To inspect that server without touching it:

```bash
curl -I http://127.0.0.1:3100/hud-tv
```

The web app's `/api/health` endpoint is database/rate-limit backed and is not the local cockpit readiness probe. Use `scripts/ovie-hud.sh health` instead.