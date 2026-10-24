# Electron chat source-host measurements

Use a clean committed checkout, repository Node/pnpm pins, an unlocked foreground desktop, and the pinned Electron binary from normal dependency preparation:

```sh
timeout 30m doppler run --project jovie-web --config dev -- sh -c 'NEXT_PUBLIC_SENTRY_RELEASE=$(git rev-parse HEAD) NEXT_PUBLIC_BUILD_SHA=$(git rev-parse HEAD) E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web build'
ELECTRON_CHAT_REPORT=/tmp/electron-chat.json timeout 9m doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web perf:electron-chat
```

The adapter in `apps/web/tests/performance` compiles `apps/desktop`, launches its existing BrowserWindow with `JOVIE_DEV=1`, and owns a loopback standalone server and temporary profile. Packaged CDP restrictions remain enforced; Playwright background scheduling overrides are removed only for this opted-in source profile. Each door runs three warmups, five canonical browser round trips, and native hide/restore with live SSE deltas. Only foreground frames are scored. Missing/extra windows, wrong baked SHAs, renderer/focus loss and incomplete samples fail closed. Retries are disabled; runner and process deadlines bound execution.

Receipts identify Electron/Chromium, OS, source identity, foreground and workload. They are `automated-source-host`, `diagnostic-first-slice`, separate from installed CPU/memory baselines and packaged production acceptance. JOV-8755 owns remaining composer/transcript/decision/audio and trusted comparator integration after JOV-8720–8724 land, plus a complete run on a provisioned foreground host.
