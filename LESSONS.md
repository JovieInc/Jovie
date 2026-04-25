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

### Windows setup must use Git Bash, not the WSL launcher

**Mistake:** In a Windows PowerShell automation shell, `bash ./scripts/setup.sh` resolved to `C:\Windows\System32\bash.exe`, the WSL launcher. WSL was denied in the sandbox, so setup looked broken even though Git for Windows Bash was installed and worked.

**Rule:** On Windows PowerShell, run `.\scripts\setup.ps1`. The wrapper locates Git for Windows Bash directly and avoids the WSL launcher. Setup should also verify `gh auth status` so PR automation failures are caught before `/train` tries to update branches.

### Staging auth must never fall back to production Clerk keys

**Mistake:** Staging auth routes were allowed to resolve production Clerk keys when `CLERK_PUBLISHABLE_KEY_STAGING` / `CLERK_SECRET_KEY_STAGING` were missing at runtime. That produced `500`s on `staging.jov.ie/signin` and `staging.jov.ie/signup` while `main` kept passing earlier checks.

**Rule:** Treat `staging.jov.ie` and `main.jov.ie` as strict staging hosts. They must use only the staging Clerk pair. If the staging pair is incomplete during deploys or cold starts, fail closed: public auth routes should render the auth-unavailable UI, and protected routes should return `503`, instead of silently falling back to production keys.

### Stale test mocks after UI removal
**Mistake:** Tests for `ClaimHandleForm` were asserting behavior for a "suggestions" UI that had been removed from the component. Tests failed with cryptic errors rather than cleanly.

**Rule:** When removing a UI feature, immediately search for and delete any tests that assert that feature's behavior. Don't leave stale tests that will fail CI later.

### Mock return types must match full hook return type
**Mistake:** `vi.mock('@/components/organisms/profile-shell/useProfileShell', ...)` was missing `modeLinks` and `socialLinks` fields. `ProfileShell.tsx` called `.map()` on these at runtime, causing crashes.

**Rule:** When mocking a custom hook, destructure the hook's return type and ensure ALL fields are present in the mock — especially arrays (use `[]` as default). Partial mocks that omit array fields will crash on `.map()` / `.filter()` calls.


### Local auth bypass must stay host-stable

**Mistake:** Local perf auth bootstrap assumed the test-auth bypass was broken when `/api/dev/test-auth/enter` redirected a `127.0.0.1` request to `localhost`. The bypass cookies were host-only, so the redirected `/app` request arrived signed out and bounced to `/signin`.

**Rule:** For local authenticated testing, keep test-auth redirects app-relative so bypass cookies survive on the original loopback host. When debugging local auth, verify whether the failure is a host mismatch (`localhost` vs `127.0.0.1`) before blaming Clerk or missing test users.

### Next cache invalidation must stay Node-safe in shared test helpers

**Mistake:** `invalidateTestUserCaches()` called `revalidateTag()` during `seedTestData()`, which also runs from `tests/global-setup.ts` in plain Node. That path has no Next static generation store, so E2E seeding crashed before tests even started.

**Rule:** In helpers shared between route handlers and Playwright/global setup scripts, treat `revalidateTag()` and `revalidatePath()` as request-context-dependent. Catch only the specific `static generation store missing` invariant for plain Node entrypoints and rethrow any other cache invalidation error.

---

## Marketing Pages

### Never link to `/claim` from CTAs
**Mistake:** PricingSection CTAs linked to `/claim` which 404s. The correct signup route is `/signup`.

**Rule:** Marketing CTAs always link to `/signup` (not `/claim`, `/register`, or `/waitlist`). `/claim` is the artist profile claim flow (different intent).

### Marketing traction copy must be factual
**Mistake:** Homepage marketing copy claimed artist adoption counts that were not true (`500+` and `47+ artists already on Jovie`).

**Rule:** Never invent or estimate adoption metrics in marketing copy. If the current number is not verified, use qualitative launch-stage language instead of a hard count.

### CSS cache corruption after git worktree switches
**Mistake:** Switching branches or running `git stash`/`pop` while the dev server is running corrupts the Turbopack CSS cache. Tokens appear to render wrong values even though source CSS is correct.

**Fix:** `rm -rf apps/web/.next` then restart the dev server. Always stop the dev server before stash/checkout operations.

### Tim White homepage identity must come from one canonical source
**Mistake:** Homepage demos mixed old local Tim White images with a different blob-hosted avatar and used the wrong Spotify artist identifier in mock links.

**Rule:** If the homepage uses Tim White, use a single canonical source for founder identity data across all homepage demos and mocks. Do not guess or hardcode alternate photos. Tim White's Spotify artist ID is `4u`, and sibling homepage references must be updated together.

### Human feedback about visual slop must become a repo rule immediately
**Mistake:** A human explicitly rejected eyebrow labels and extra marketing chrome multiple times, but the next revision still reintroduced eyebrows, separators, and wrapper cards because the correction was treated as local taste feedback instead of a persistent rule.

**Rule:** When a human calls out visual slop in marketing UI, convert that correction into a shared repo rule immediately. Do not rely on remembering the preference for one file. If the correction is "remove eyebrows," "remove cards," or "stop adding extra copy," update the shared guidance and then delete the source of that pattern from the shared components and copy contracts.

---

## Email Personalization

### Outbound greetings must fail safe instead of guessing names

**Mistake:** Claim-invite emails tried to personalize the greeting from arbitrary creator strings. That risks obvious bad mail-merge output like `timwhite!`, `tim<3!`, emoji names, or smashed-together handles, which makes the outreach feel fake immediately.

**Rule:** Only personalize outbound greetings when the source clearly looks like a conventional two-word human name. If there is any doubt, use a generic opener instead. When tightening one risky email template, audit sibling templates that interpolate the same creator/user fields and apply the same guard there too.

## Chat Backend

### Main chat route drift turns `/api/chat` into a second product backend

**Mistake:** Album art generation, release creation, pitch persistence, and other product-specific backend work accumulated inside `apps/web/app/api/chat/route.ts`. That made the streaming route slow, fragile, and hard to test. The album-art production timeout was the obvious break, but the deeper failure was architectural drift.

**Rule:** Keep `apps/web/app/api/chat/route.ts` orchestration-only. It may authenticate, load context, pick a model, register imported tools, and stream the response. It must not own provider calls, uploads, image rendering, direct persistence, or inline tool-builder implementations. New chat tools belong in `apps/web/lib/chat/tools/` and should call shared services or dedicated worker-style routes.

### Chat confirm routes must resolve ownership through Clerk-to-user mapping

**Mistake:** `confirm-edit` and `confirm-remove-link` compared internal `creatorProfiles.userId` values to Clerk `userId` values from `getCachedAuth()`. That silently mixed identifier systems and could reject valid owners or log audit rows under the wrong user.

**Rule:** Any chat confirmation route that checks profile ownership must resolve the profile through the canonical Clerk-to-user join first. Do not compare internal user UUIDs directly to Clerk user IDs.

---

## Tailwind v4 / Design Tokens

### CSS variables in `:root` don't auto-register as Tailwind utilities
**Mistake:** Adding `--color-*` vars to `:root` in `design-system.css` and expecting them to work as `bg-*` / `text-*` utilities.

**Rule:** Tailwind v4 utilities MUST be declared in `@theme` or `@theme inline` blocks in `globals.css`. Variables in `:root` are CSS-only; they don't generate utility classes automatically.

### Shell canvas and card surfaces must stay separate
**Mistake:** A dark-shell cleanup changed tokens, but some task/preview routes still rendered bordered cards and even full table routes directly on `bg-(--linear-app-content-surface)`. That made cards blend into the canvas and left task pages looking like one flat rectangle.

**Rule:** In the app shell, `bg-(--linear-app-content-surface)` is shell chrome/canvas only. Shared cards and panels use `bg-surface-1`, recessed wells use `bg-surface-0`, and table/workspace routes must wrap primary content in `DashboardWorkspacePanel` plus `LINEAR_SURFACE.contentContainer`.

### AI-generated UI defaults drift toward all-caps and border-heavy layouts
**Mistake:** Agents produced generic AI-looking product UI with uppercase eyebrow labels, long explanatory copy, and bordered cards used as the main hierarchy device. The result felt cheap and off-brand instead of Linear-inspired and premium.

**Rule:** For Jovie product UI, default to small type, normal Title Case labels, restrained emphasis, and minimal chrome. Do not use uppercase labels or extra borders as the default way to make something feel designed. Solve hierarchy with spacing, typography, and surface contrast first.

---

## Git Workflow

### Windsurf IDE silently reverts external file edits
**Mistake:** Edits made by Claude Code (via `Edit` tool) to files open in Windsurf were silently reverted by the IDE's auto-save behavior.

**Rule:** Before editing a file that may be open in another editor, close it in that editor first. Use `git diff` after edits to verify changes persisted. If edits are reverted, write the file atomically with `python3` open/write/close instead of incremental edits.

---

## CI / Build

### Local Doppler commands must pin `jovie-web/dev`
**Mistake:** Local commands were run as bare `doppler run -- ...`, which depends on ambient Doppler scope. In fresh worktrees that can fail with "You must specify a config" even though the repo always expects the `jovie-web/dev` local setup.

**Rule:** For local development, testing, and agent commands that need secrets, use `doppler run --project jovie-web --config dev -- <command>`. `scripts/setup.sh` and printed examples should use the same explicit form.

### New generated Drizzle migrations must be allowed to update `_journal.json`
**Mistake:** The root migration rule and file-protection hook treated any `_journal.json` edit as forbidden, even though the repo's migration scripts require a new migration to append the journal and add a snapshot.

**Rule:** Existing migration SQL and snapshot files are immutable once they exist on the base branch. New generated migration artifacts are allowed to add one new SQL file, one new snapshot, and the corresponding `_journal.json` entry.

### `pnpm vitest --run --changed` exits 0 with no test files
**Situation:** When no changed test files exist, `vitest --run --changed` exits with code 0 and prints "No test files found." This is not a failure — it means all affected tests are implicitly passing (no files changed to test).

**Don't:** Treat this as a CI failure. Don't retry or investigate.

### `/claim` route gating in sentry route-detector
**Situation:** `lib/sentry/route-detector.ts` references `/claim` as a known public route for Sentry performance tracking. This is intentional — the route exists for artist profile claiming. Don't confuse this with marketing CTAs that should link to `/signup`.

### Optional promo fixtures must not break public CI lanes
**Mistake:** `tests/seed-test-data.ts` treated a missing `promo_downloads` relation as fatal even in shared CI lanes like Lighthouse that only need the core public surfaces. If that optional table was absent, the seed step failed before any page audit ran.

**Rule:** For public-route, Lighthouse, and a11y CI seeding, optional fixtures should warn and skip when their dedicated relation is missing. Only required schema should abort the seed.

### Playwright route-audit manifests must not crash at import time
**Mistake:** `axe-audit.spec.ts` resolved public surface manifests at module load. Any env or manifest error then failed the entire file with an opaque import-time crash, which made CI triage much harder.

**Rule:** In Playwright route-audit specs, catch manifest/env resolution at load time and rethrow it through an always-registered test or other explicit failure path. `beforeAll` is not enough if manifest failure can leave the file with zero generated tests.

### Preview bypasses must not reopen production health routes
**Mistake:** `/api/health/auth` allowed the test-bypass probe path whenever the bypass resolver returned a user, even on deployments running with `NODE_ENV=production`. Because preview-host trust was derived from request headers, that reopened a sensitive debug route if the bypass flag ever leaked into production.

**Rule:** Health/debug endpoints that support CI preview probes must hard-block when `VERCEL_ENV=production`, regardless of bypass flags, cookies, or request headers. Preview-only bypasses are acceptable; production bypasses are not.
