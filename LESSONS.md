# Lessons Learned — Jovie Codebase

Recurring mistakes and how to avoid them. Updated whenever a correction is made.
See `AGENTS.md` guardrail #10 for the self-improvement loop process.

---

## DSP / Provider Keys

### YouTube vs YouTube Music are distinct ProviderKeys
**Mistake:** `youtube` and `youtube_music` were conflated — `youtube` was labeled "YouTube Music" and used the circle icon. This caused the wrong icon/name to display and prevented proper deep-linking to YouTube Music.

**Rule:** `youtube` = the main YouTube platform (play-button icon, `youtube.com` domain). `youtube_music` = YouTube Music streaming service (circle/music icon, `music.youtube.com` domain). They must be separate entries in ALL of: `ProviderKey` union, `DSP_LOGO_CONFIG`, `DSP_CONFIGS`, `PROVIDER_DOMAINS`, `PROVIDER_TO_DSP`, `GLOBAL_PLATFORM_POPULARITY`, `PROVIDER_PLATFORM_MAP`.

**Files to update when adding a new DSP:** `lib/discography/types.ts`, `components/atoms/DspLogo.tsx`, `lib/dsp.ts`, `lib/profile-dsps.ts`, `lib/discography/provider-domains.ts`, `components/organisms/release-sidebar/ReleaseDspLinks.tsx`, `lib/discography/config.ts`, `components/demo/mock-release-data.ts`, `constants/app.ts`, `components/atoms/ProviderIcon.tsx`.

---

## Testing

### Stale test mocks after UI removal
**Mistake:** Tests for `ClaimHandleForm` were asserting behavior for a "suggestions" UI that had been removed from the component. Tests failed with cryptic errors rather than cleanly.

**Rule:** When removing a UI feature, immediately search for and delete any tests that assert that feature's behavior. Don't leave stale tests that will fail CI later.

### Mock return types must match full hook return type
**Mistake:** `vi.mock('@/components/organisms/profile-shell/useProfileShell', ...)` was missing `modeLinks` and `socialLinks` fields. `ProfileShell.tsx` called `.map()` on these at runtime, causing crashes.

**Rule:** When mocking a custom hook, destructure the hook's return type and ensure ALL fields are present in the mock — especially arrays (use `[]` as default). Partial mocks that omit array fields will crash on `.map()` / `.filter()` calls.

---

## Marketing Pages

### Never link to `/claim` from CTAs
**Mistake:** PricingSection CTAs linked to `/claim` which 404s. The correct signup route is `/signup`.

**Rule:** Marketing CTAs always link to `/signup` (not `/claim`, `/register`, or `/waitlist`). `/claim` is the artist profile claim flow (different intent).

### CSS cache corruption after git worktree switches
**Mistake:** Switching branches or running `git stash`/`pop` while the dev server is running corrupts the Turbopack CSS cache. Tokens appear to render wrong values even though source CSS is correct.

**Fix:** `rm -rf apps/web/.next` then restart the dev server. Always stop the dev server before stash/checkout operations.

---

## Tailwind v4 / Design Tokens

### CSS variables in `:root` don't auto-register as Tailwind utilities
**Mistake:** Adding `--color-*` vars to `:root` in `design-system.css` and expecting them to work as `bg-*` / `text-*` utilities.

**Rule:** Tailwind v4 utilities MUST be declared in `@theme` or `@theme inline` blocks in `globals.css`. Variables in `:root` are CSS-only; they don't generate utility classes automatically.

---

## Git Workflow

### Windsurf IDE silently reverts external file edits
**Mistake:** Edits made by Claude Code (via `Edit` tool) to files open in Windsurf were silently reverted by the IDE's auto-save behavior.

**Rule:** Before editing a file that may be open in another editor, close it in that editor first. Use `git diff` after edits to verify changes persisted. If edits are reverted, write the file atomically with `python3` open/write/close instead of incremental edits.

---

## CI / Build

### `pnpm vitest --run --changed` exits 0 with no test files
**Situation:** When no changed test files exist, `vitest --run --changed` exits with code 0 and prints "No test files found." This is not a failure — it means all affected tests are implicitly passing (no files changed to test).

**Don't:** Treat this as a CI failure. Don't retry or investigate.

### `/claim` route gating in sentry route-detector
**Situation:** `lib/sentry/route-detector.ts` references `/claim` as a known public route for Sentry performance tracking. This is intentional — the route exists for artist profile claiming. Don't confuse this with marketing CTAs that should link to `/signup`.
