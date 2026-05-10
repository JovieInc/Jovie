# Plan: Merge Feature Branches and Adjust Electron Authentication to Browser-Based

## Goal
1. Merge feature branches for missing UI features (lyric mode, audio player, sidebar colors, KB shortcuts, etc.) into the main development branch.
2. Change Electron app authentication flow to use browser-based OAuth (redirect to browser for Google/Clerk sign-in, then redirect back to the app) to enable one-click login via existing browser sessions.
3. Handle auth and marketing branches with extra caution due to potential new design work.

## Current Context
- Current branch: `tim/free-model-defaults`
- Many feature branches exist (see `git branch` output) for specific features:
  - Lyric mode: `itstimwhite/design-v1-lyrics-library`
  - Audio player: `itstimwhite/design-v1-shell-audio`
  - Shell polish: `itstimwhite/design-v1-shell-polish`
  - Tasks/chat: `itstimwhite/design-v1-tasks-chat`
  - Public auth: `itstimwhite/design-v1-public-auth`
  - Releases drawers: `itstimwhite/design-v1-releases-drawers`
  - Motion tokens/KB shortcuts: `itstimwhite/motion-tokens` and `itstimwhite/motion-tokens-fix`
  - Sidebar surfaces: `itstimwhite/shell-v1-app-surfaces`
- Electron app (`apps/desktop/src/main.ts`) currently allows Clerk auth hosts to load in-app.
- User prefers browser-based auth for Google one-click login (similar to Linear and Claude).
- Auth and marketing branches may contain unfinished design work; handle with care.

## Proposed Approach

### Phase 1: Prepare Integration Branch
1. Create a temporary integration branch from `develop` (following branch protection rules: never push directly to preview/main).
   ```bash
   git checkout develop
   git pull
   git checkout -b integrate/features-and-auth-electron
   ```
2. This branch will be used to test merges before targeting `develop`.

### Phase 2: Merge Non-Auth/Non-Marketing Feature Branches
Merge the following branches first (lower risk, UI/features):
   - `itstimwhite/design-v1-lyrics-library`
   - `itstimwhite/design-v1-shell-audio`
   - `itstimwhite/design-v1-shell-polish`
   - `itstimwhite/design-v1-tasks-chat`
   - `itstimwhite/design-v1-releases-drawers`
   - `itstimwhite/motion-tokens`
   - `itstimwhite/motion-tokens-fix`
   - `itstimwhite/shell-v1-app-surfaces`
   - `itstimwhite/design-v1-public-auth` (note: public auth may touch auth, review carefully)
   - `itstimwhite/design-v1-shell-polish` (already listed)

For each branch:
   ```bash
   git merge --no-ff <branch-name>
   ```
   - Resolve conflicts if any.
   - Run `pnpm --filter @jovie/web run typecheck` and `pnpm --filter @jovie/web run lint` to ensure no regressions.
   - If conflicts or issues arise, abort the merge and note for manual review.

### Phase 3: Handle Auth and Marketing Branches with Caution
Identify auth/marketing-related branches from the list (examples):
   - `itstimwhite/design-v1-public-auth` (already considered above)
   - `itstimwhite/clerk-bootstrap*` (various)
   - `itstimwhite/itstimwhite/clerk-7-2-fix`
   - `itstimwhite/itstimwhite/clerk-bootstrap-nairobi`
   - `itstimwhite/itstimwhite/clerk-google`
   - Marketing: `itstimwhite/homepage-marketing-slice`, `itstimwhite/homepage-core-slice`, `itstimwhite/design-sweep`, etc.

For each:
   1. Create a temporary branch from the integration branch.
   2. Merge the feature branch.
   3. Run thorough checks:
        - Typecheck, lint, and tests (especially auth flow tests).
        - Manually verify auth flows (sign-in, sign-up, password reset) in both web and Electron.
        - Check for design inconsistencies (compare with DESIGN.md).
   4. If satisfactory, merge into the integration branch; else, note issues and revisit after design review.

### Phase 4: Modify Electron App for Browser-Based Auth
**Objective:** Block all non-app-origin top-level navigations in the Electron app (forcing them to open in the system browser), allowing only navigations to `APP_ORIGIN` (the app itself) to load in-app. This ensures:
   - Google/Clerk auth flows open in the browser (for one-click login via existing sessions).
   - After auth, Clerk redirects back to `APP_ORIGIN` (allowed in-app), loading the callback in the Electron window.
   - Works similarly for the Chrome extension (if it uses the same origin).

**Changes needed in `apps/desktop/src/main.ts`:**
1. Modify `isAllowedInAppUrl` function to only allow the app's origin:
   ```typescript
   function isAllowedInAppUrl(parsed: URL): boolean {
     // Only allow navigations to the exact app origin (no subdomains, unless APP_ORIGIN includes them)
     return parsed.origin === APP_ORIGIN;
   }
   ```
   - Note: `APP_ORIGIN` is derived from `APP_URL` (e.g., `https://app.jovie.tv`).
   - This blocks:
        - `accounts.google.com`
        - `appleid.apple.com`
        - `*.clerk.com` and `*.clerk.accounts.dev`
        - Any other external domain (good for security).
   - Allows only navigations back to `https://app.jovie.tv` (or whatever `APP_URL` is).

2. Ensure the `ALLOWED_AUTH_HOSTS` and `ALLOWED_HOST_SUFFIXES` constants are no longer used (can be removed or commented out).

3. Verify that the `openExternalUrl` function is called for blocked navigations (it already is).

4. Test the flow:
        - Launch Electron app.
        - Click sign-in → should open browser to Clerk/Google.
        - Complete auth in browser → Clerk redirects back to `https://app.jovie.tv/...`.
        - Electron app should load that URL in-app (since it matches `APP_ORIGIN`).
        - Verify session is established.

### Phase 5: Validation and Testing
1. **Web App (browser):**
        - Verify auth still works normally when accessing the web app directly in a browser (should be unaffected by Electron changes).
2. **Electron App:**
        - Test auth flow: sign-in, sign-up, session persistence.
        - Test that external links (e.g., to `https://example.com`) still open in the system browser.
        - Test that internal navigation (within the app) works.
3. **Chrome Extension (if applicable):**
        - If the extension relies on the same origin, verify it can still interact with the app after auth.
4. **Run Tests:**
        - `pnpm --filter @jovie/web run test:web:smoke` (or relevant auth tests).
        - Electron-specific tests if any exist.
5. **Check for Regressions:**
        - Ensure no broken links or missing features after merges.

### Phase 6: Merge to Develop and Promote
1. Once the integration branch passes validation:
        ```bash
        git checkout develop
        git merge --no-ff integrate/features-and-auth-electron
        ```
2. Push to remote:
        ```bash
        git push origin develop
        ```
3. Let CI/CD handle promotion to preview and main (do not push directly to preview/main).

## Files Likely to Change
- `apps/desktop/src/main.ts` (Electron auth flow)
- Potentially many files from merged feature branches (UI components, styles, etc.)
- Lock files (`pnpm-lock.yaml`) due to dependency updates.

## Tests / Validation
- Typecheck: `pnpm --filter @jovie/web run typecheck -- --pretty false`
- Lint: `pnpm biome check --write apps/web`
- Auth-specific tests: check `apps/web/tests` for auth-related test files.
- Manual QA:
        - Web app auth in browser (Chrome/Firefox).
        - Electron app auth (sign-in, sign-out, session).
        - External link handling in Electron.
        - Verify UI features (lyric mode, audio player, etc.) are present and functional.

## Risks, Tradeoffs, and Open Questions
### Risks
   - Merging many branches at once may introduce conflicts or bugs.
   - Changing Electron auth to block all non-app navigations might break legitimate in-app navigations to subdomains (if we use subdomains for assets). However, `APP_ORIGIN` includes the full origin (scheme, host, port), so subdomains of our app would be blocked. We may need to adjust if we use subdomains (e.g., `assets.app.jovie.tv`). If so, we should allowlist specific subdomains or use a domain matching approach (e.g., `parsed.hostname.endsWith('.app.jovie.tv')`).
   - Auth and marketing branches may contain WIP design that could conflict with the main branch or each other.

### Tradeoffs
   - Browser-based auth provides better SSO experience (one-click Google) but adds a brief context switch to the browser.
   - Electron app becomes more secure by restricting in-app navigations to only the app origin.

### Open Questions
   1. Do we use any subdomains of our main domain for assets or services that need to load in-app in the Electron app? If yes, we need to adjust the `isAllowedInAppUrl` function to allow those subdomains.
   2. Are there any specific test cases for auth flows in the Electron app that we should run?
   3. Should we create a separate plan for the Chrome extension auth flow (if it differs)?
   4. What is the exact timeline for merging? Should we do it in smaller batches?

## Next Steps (for the User)
1. Review this plan and provide feedback or approval.
2. If approved, I can proceed to create the integration branch and start merging (in delegate mode, not plan mode).
3. Alternatively, you may want to handle the auth/marketing branches yourself due to design sensitivity.