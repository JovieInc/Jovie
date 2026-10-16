# BLOCKER: JOV-2460 — Rotate `CLAUDE_CODE_OAUTH_TOKEN`

**Status:** Blocked — requires human action in Claude Console  
**Issue:** [JOV-2460](https://linear.app/jovie/issue/JOV-2460/tim-action-required-rotate-claude-code-oauth-token-622-days-stale)  
**Branch:** `grok/JOV-2460-fix` (clean vs `origin/main` — no product code change possible)  
**Verified:** 2026-08-01T02:28:30Z UTC (re-checked this session; still blocked)

## Exact reason

This issue is classified **manual** (`[tim-action-required]`). The agent sandbox **cannot** generate a new Claude Code OAuth token from the Claude Console. No usable token material exists in this environment:

| Source checked | Result |
|----------------|--------|
| Process env (`CLAUDE*`, `ANTHROPIC*`, `CLAUDE_CODE_OAUTH_TOKEN`) | Absent |
| Doppler `jovie-web/dev` | `Doppler Error: you must provide a token` (no CLI token in this sandbox); no path to pull Claude OAuth material |
| Invent / guess a token | Forbidden — would break or silently degrade CI Claude Code Action consumers |

Setting `gh secret set CLAUDE_CODE_OAUTH_TOKEN` without a **freshly generated** Claude Console token is impossible and unsafe.

Per issue classification: *"Required (manual — agent sandbox cannot rotate Claude Console tokens)"*.

## Current evidence

| Check | Result |
|-------|--------|
| `gh secret list --json name,updatedAt` | Secret **exists** on `JovieInc/Jovie` |
| Last `updatedAt` | `2025-09-02T21:17:47Z` (**332 days** stale as of 2026-08-01; issue title cites 622 — still stale either way) |
| Age within 24h (acceptance) | **No** |
| `gh` auth | `itstimwhite` with `repo` + `workflow` + `admin:org` — can set secrets **if** a real token body is supplied |
| Code/config change required | **No** (pure secret consumption; issue states no downstream config update) |
| PR / commit | **None** — a no-op or docs-only PR with `Fixes JOV-2460` would falsely close the issue |

### Workflow consumers (verified via repo grep)

| Workflow | Usage |
|----------|--------|
| `.github/workflows/sentry-autofix.yml:95` | `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` |
| `.github/workflows/main-autofix.yml:498` | same |
| `.github/workflows/claude.yml:65` | same |
| `.github/workflows/claude-review.yml:212` | same (comment notes shared with main-autofix) |
| `.github/workflows/github-ai-orchestrator.yml:305` | same |

Silent-fail risk remains on agent-driven autofix / Claude Code Action flows until rotation succeeds.

## What a human (Tim) must do

1. **Generate a new token** in the Claude Console (Claude Code OAuth / long-lived CI token — same type currently stored as `CLAUDE_CODE_OAUTH_TOKEN`).
2. **Set the GitHub secret** (repo `JovieInc/Jovie`):
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "$NEW_TOKEN" --repo JovieInc/Jovie
   ```
3. **Verify age:**
   ```bash
   gh secret list --repo JovieInc/Jovie --json name,updatedAt \
     --jq '.[] | select(.name=="CLAUDE_CODE_OAUTH_TOKEN")'
   ```
   Expect `updatedAt` within the last 24h.
4. **Smoke-test auth** — dispatch `sentry-autofix.yml` and confirm the Claude Code Action step authenticates (not token expired / 401):
   ```bash
   gh workflow run sentry-autofix.yml --repo JovieInc/Jovie
   gh run list --workflow=sentry-autofix.yml --repo JovieInc/Jovie --limit 1
   ```
5. Mark **JOV-2460 Done** once criteria pass:
   - Secret age ~0 days
   - One successful `sentry-autofix` run after rotation

## What the agent did / did not do

| Did | Did not |
|-----|---------|
| Confirmed secret exists + age via `gh secret list` | Invent or guess a token |
| Confirmed all workflow consumers under `.github/workflows/` | Call `gh secret set` without a real token |
| Confirmed no token in process env; Doppler unavailable here | Open a no-op PR claiming the fix (`Fixes JOV-2460`) |
| Documented exact manual steps for Tim | Merge anything |
| Left product tree clean (`grok/JOV-2460-fix` = `origin/main`) | Commit fake “rotation complete” evidence |

## Acceptance criteria (still open)

- [ ] New token in GH secrets, age 0 days  
- [ ] One successful run of `sentry-autofix` after rotation  

## Dependency

Claude Console access owned by Tim / org admin. No code PR can close this issue.
