# Performance Audit: Top 10 Issues Still Open

Date: 2026-01-13

This audit lists the ten highest-impact performance issues that remain open, based on current code and the existing performance task backlog. Each item includes evidence and a suggested next step so execution can be scoped quickly.

## 1) Homepage: Missing critical font preload
**Why it matters**: Without preloading the primary font, the homepage can flash unstyled text and delay first paint.
**Evidence**: Open task in `HOMEPAGE_PERFORMANCE_TASKS.md`.
**Suggested next step**: Add font preloads to the homepage head and confirm with WebPageTest.

## 2) Homepage: Offscreen sections are not deferred
**Why it matters**: Rendering heavy sections below the fold increases initial JS work and delays interaction.
**Evidence**: Open task in `HOMEPAGE_PERFORMANCE_TASKS.md`.
**Suggested next step**: Gate offscreen sections behind an `IntersectionObserver` or lazy-load wrappers.

## 3) Homepage: Lazy-loading audit still pending
**Why it matters**: Above-the-fold images should stay eager, but below-the-fold images need lazy loading to reduce LCP pressure and network contention.
**Evidence**: Open task in `HOMEPAGE_PERFORMANCE_TASKS.md`.
**Suggested next step**: Audit marketing images and enable `loading="lazy"` or Next.js `Image` defaults where appropriate.

## 4) Homepage: Server Components adoption not evaluated
**Why it matters**: Keeping marketing content in server components can reduce client bundle size and hydration work.
**Evidence**: Open task in `HOMEPAGE_PERFORMANCE_TASKS.md`.
**Suggested next step**: Identify static sections that can be rendered as server components and keep client-only islands minimal.

## 5) Sentry dashboard state polls every 500ms with no stop condition
**Why it matters**: The interval fires continuously, even after upgrade completion, consuming CPU on every client session.
**Evidence**: `useSentryDashboardState` sets a 500ms `setInterval` that never stops once the state is stable.
**Suggested next step**: Stop polling once `isUpgraded()` returns true or when the upgrade state reaches a terminal state.

## 6) Release countdown keeps polling after reaching zero
**Why it matters**: The countdown keeps the interval alive after the release passes, repeatedly calling `router.refresh()` every minute until unmount.
**Evidence**: The interval in `ReleaseCountdown` never clears when `total <= 0`.
**Suggested next step**: Clear the interval when the countdown hits zero to avoid redundant refreshes.

## 7) Marketing comparison UI runs perpetual timers
**Why it matters**: The comparison visual loops phases with `setTimeout`, creating continuous work even when offscreen.
**Evidence**: `JovieProfileUI` advances phases on a loop using timeouts.
**Suggested next step**: Pause animations when the section is offscreen, or gate the animation behind `IntersectionObserver`.

## 8) Analytics cards animate every update via requestAnimationFrame
**Why it matters**: The count-up animation updates state every animation frame, which can be expensive on slower devices.
**Evidence**: `DashboardAnalyticsCards` uses `requestAnimationFrame` to update `displayProfileViews` each frame.
**Suggested next step**: Limit the animation to when the card is in view, or reduce frame frequency for large counts.

## 9) OptimizedImage recomputes props on loading state changes
**Why it matters**: Large grids of images re-run memoized logic and recreate handlers when `isLoading` flips, which can amplify render cost.
**Evidence**: `OptimizedImage` uses `useMemo` with `isLoading` in the dependency array.
**Suggested next step**: Split stable props from loading-state props so only the minimal part re-renders.

## 10) Analytics query cache is only 5 seconds
**Why it matters**: A 5s stale time can cause frequent refetches, especially on tab focus or navigation, adding network churn.
**Evidence**: `useDashboardAnalyticsQuery` defaults to `staleTime = 5000`.
**Suggested next step**: Increase stale time for dashboard analytics, and refresh explicitly on user action.

---

## Next Actions
1. Prioritize issues 1–4 for marketing LCP and bundle size wins.
2. Address issues 5–7 to reduce idle CPU usage on client devices.
3. Tackle issues 8–10 to cut avoidable re-renders and refetches.
