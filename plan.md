# Electron Mac App for Jovie — Architecture Plan & Feasibility Analysis

## Executive Summary

This document evaluates building an Electron Mac app for Jovie, a music artist profile/link-in-bio SaaS platform. After thorough analysis, **I recommend against building an Electron app at this time** and instead suggest enhancing the existing PWA. The reasoning is detailed below.

---

## Part 1: Current Architecture Inventory

### What Exists Today

| Layer | Technology | Desktop Compatibility |
|-------|-----------|----------------------|
| Framework | Next.js 16 (App Router) | Server Components incompatible with Electron |
| React | React 19 with Compiler | Compatible |
| UI | @jovie/ui (Radix + Tailwind) | Fully compatible |
| Auth | Clerk (JWT + webhooks) | Needs Electron-specific OAuth flow |
| DB Access | Drizzle ORM via Neon HTTP | Server-only; no direct client access |
| State | TanStack Query v5 | Fully compatible |
| Forms | React Hook Form + Zod | Fully compatible |
| Payments | Stripe | Web-only checkout; compatible via WebView |
| AI Chat | AI SDK + SSE streaming | Compatible if pointing to remote API |
| Analytics | Sentry, Statsig, Vercel | Sentry compatible; others web-only |

### Code Distribution Analysis

```
Total app code (apps/web):
├── Server-only code (~45%)
│   ├── Server Components (RSC)
│   ├── Server Actions
│   ├── API routes (41 directories)
│   ├── Database queries (Drizzle)
│   ├── Middleware (proxy.ts)
│   └── Webhook handlers
│
├── Shared/Client code (~40%)
│   ├── React components (atoms, molecules, organisms)
│   ├── TanStack Query hooks (55+ hooks)
│   ├── Form logic (React Hook Form)
│   ├── UI state management
│   ├── Utility functions
│   └── Type definitions / Zod schemas
│
└── Browser-specific code (~15%)
    ├── PWA manifest
    ├── Web Vitals tracking
    ├── CSP/security headers
    └── Vercel-specific features
```

**Key takeaway:** ~45% of the codebase is server-only and cannot run in Electron's renderer process.

---

## Part 2: Viable Architecture Options

### Option A: Electron Shell Loading Remote Web App

```
┌─────────────────────────────────────┐
│ Electron Main Process               │
│ ├── Native menu bar                 │
│ ├── System tray icon                │
│ ├── Native notifications            │
│ ├── Auto-updater                    │
│ └── Deep link handler               │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ BrowserWindow (Chromium)        │ │
│ │ └── Loads https://jov.ie/app    │ │
│ │     (your production web app)   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**New code needed:** ~800-1,200 lines (Electron main process only)
**Code shared with web:** 100% (it IS the web app)
**Duplication:** Zero

**Pros:**
- Zero code duplication — loads the existing web app
- Ship in days, not months
- Bug fixes deploy instantly (no app update needed)
- Auth, payments, all features work identically

**Cons:**
- Requires internet connection (no offline)
- Barely different from a browser bookmark / PWA
- App Store rejection risk (Apple rejects "website wrappers")
- Limited native integration (IPC bridge needed for notifications)
- Users could ask "why not just use the browser?"

**Verdict:** Low effort but also low value. Essentially a branded browser.

---

### Option B: Electron + Embedded Next.js Server

```
┌──────────────────────────────────────────┐
│ Electron Main Process                     │
│ ├── Spawns Next.js server (localhost)     │
│ ├── Native menus, tray, notifications    │
│ ├── Auto-updater (electron-updater)      │
│ └── IPC bridge for native features       │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ BrowserWindow                        │ │
│ │ └── Loads http://localhost:3000      │ │
│ │     (embedded Next.js server)        │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Next.js Server (child process)       │ │
│ │ ├── All existing server code         │ │
│ │ ├── API routes                       │ │
│ │ ├── Server Components               │ │
│ │ └── Server Actions                   │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

**New code needed:** ~2,000-4,000 lines
**Code shared with web:** ~95% (same Next.js app)
**Duplication:** Minimal (Electron wrapper + config)

**Pros:**
- Full feature parity with web
- Server Components and Actions work as-is
- Offline potential (with local DB fallback)
- True native integration possible

**Cons:**
- **Neon PostgreSQL requires internet** — DB is remote/serverless
- **Clerk auth requires internet** — JWT validation hits Clerk servers
- App bundle size: ~200-400MB (ships Chromium + Node.js + Next.js)
- Startup time: 3-8 seconds (spawning Node + Next.js server)
- Memory usage: 300-600MB (Chromium + Node.js)
- Environment variables management (Doppler won't work locally)
- Significantly more complex CI/CD (code signing, notarization, updates)
- Must maintain Electron + Next.js version compatibility
- Security: shipping server code to user's machine exposes API routes

**Verdict:** Maximum compatibility but heavyweight. Still requires internet for core functionality, negating the main desktop advantage.

---

### Option C: Electron + React SPA (API Client)

```
┌──────────────────────────────────────────┐
│ Electron Main Process                     │
│ ├── Native menus, tray, notifications    │
│ ├── Auto-updater                         │
│ ├── Local SQLite for offline cache       │
│ └── IPC bridge                           │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ BrowserWindow (React SPA)            │ │
│ │ ├── Shared components (@jovie/ui)    │ │
│ │ ├── Shared hooks (TanStack Query)    │ │
│ │ ├── Shared forms (RHF + Zod)         │ │
│ │ └── Calls remote API (jov.ie/api)    │ │
│ └──────────────────────────────────────┘ │
│                                          │
│          ↕ HTTP/HTTPS ↕                  │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Remote: jov.ie (Vercel)              │ │
│ │ ├── API routes                       │ │
│ │ ├── Auth (Clerk)                     │ │
│ │ └── Database (Neon)                  │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

**New code needed:** ~8,000-15,000 lines
**Code shared with web:** ~40% (UI components, hooks, types, schemas)
**Duplication:** Significant (routing, layouts, page compositions, auth flow)

**What can be shared:**
- `packages/ui` — All Radix UI components (100%)
- `lib/queries/` — TanStack Query hooks (80%, need to strip SSR)
- `lib/types/` and Zod schemas (100%)
- `components/atoms/`, `molecules/` — Most presentational components (70%)
- `hooks/` — Client-side hooks (90%)
- `constants/` — Route constants, enums (100%)

**What must be rewritten:**
- All page compositions (Server Components → Client Components)
- All Server Actions → API calls
- Auth flow (Clerk web → Clerk Electron OAuth)
- Routing (Next.js App Router → React Router / TanStack Router)
- Layouts and navigation
- Data fetching patterns (RSC → client-only)
- Middleware logic (CSP, caching)

**Pros:**
- True native experience
- Smaller bundle than Option B (~80-150MB)
- Faster startup
- Can add offline with SQLite
- Better native integration

**Cons:**
- Massive upfront investment
- 40-60% of page/layout code must be rewritten
- Two rendering pipelines to maintain forever
- Every feature ships twice (web + desktop)
- Different auth flows to test
- Different bugs in different environments
- Team cognitive load doubles

**Verdict:** Maximum native feel but maximum ongoing cost. Creates a permanent maintenance burden.

---

### Option D: Tauri (Rust-based Alternative)

Same architecture as Option C but using Tauri instead of Electron.

**Differences from Electron:**
- Bundle size: ~5-15MB (uses system WebView instead of shipping Chromium)
- Memory: ~50-100MB
- Startup: <1 second
- Backend: Rust (not Node.js)

**Additional cons:**
- Rust expertise needed for native extensions
- macOS WebKit has subtle rendering differences from Chromium
- Less mature ecosystem than Electron
- Tailwind CSS 4 / Radix UI may have WebKit quirks
- Team doesn't have Rust experience (assumption)

**Verdict:** Better technical choice than Electron IF building a native app, but same code duplication problems as Option C.

---

### Option E: Enhanced PWA (Recommended Alternative)

```
┌──────────────────────────────────────────┐
│ Existing Web App (jov.ie)                │
│ ├── Already has manifest.ts (installable)│
│ ├── Add: Service Worker for offline      │
│ ├── Add: Push notifications (Web Push)   │
│ ├── Add: Background sync                 │
│ ├── Add: Keyboard shortcuts (already has)│
│ └── Add: Better install prompt UX        │
│                                          │
│ macOS Integration (automatic):           │
│ ├── Dock icon                            │
│ ├── Native notifications                 │
│ ├── Standalone window (no browser chrome)│
│ ├── Cmd+Tab switching                    │
│ └── Badge counts                         │
└──────────────────────────────────────────┘
```

**New code needed:** ~500-1,500 lines
**Code shared with web:** 100% (it IS the web app)
**Duplication:** Zero

**What to add:**
1. **Service Worker** (`public/sw.js`) — Cache dashboard shell for offline
2. **Web Push** (`lib/notifications/web-push.ts`) — Native macOS notifications
3. **Install prompt** — Custom "Add to Dock" UX on first visit
4. **Offline dashboard** — Cache last-known analytics data
5. **Keyboard shortcuts** — Already partially implemented

**Pros:**
- Zero code duplication
- Zero new build pipeline
- Zero app signing/notarization
- No App Store review process
- Ships via web deployment (instant updates)
- Works on Mac, Windows, Linux, mobile simultaneously
- Native notifications on macOS (via Web Push)
- Standalone window (display: standalone already configured)
- Dock icon, Cmd+Tab, badge counts — all free
- Service Worker enables offline dashboard viewing
- ~10x less code than any Electron option

**Cons:**
- No system tray icon
- Can't access filesystem
- Limited offline capability (read-only cached data)
- No auto-update mechanism (but web deploys are instant anyway)
- Some users may not know PWAs are installable
- No App Store distribution/discoverability

**Verdict:** 95% of the value at 5% of the cost.

---

## Part 3: Effort vs. Value Analysis

### What Desktop Features Would Jovie Users Actually Use?

Jovie's user base is **music artists managing their profile pages**. Usage patterns:

| Activity | Frequency | Desktop Advantage? |
|----------|-----------|-------------------|
| Update profile/links | Weekly | No — form-based, works fine in browser |
| Check analytics | Daily | Marginal — dashboard works in browser |
| Respond to AI chat | Occasional | No — browser works fine |
| Manage billing | Monthly | No — Stripe checkout is web-only anyway |
| Get notified of milestones | When they happen | **Yes — native notifications** |
| Quick-access dashboard | Multiple daily | **Yes — Dock icon / system tray** |

**Only 2 of 6 core activities benefit from a desktop app**, and both are achievable via PWA.

### Development Cost Comparison

| Option | Initial Build | Ongoing Maintenance (annual) | Team Impact |
|--------|--------------|------------------------------|-------------|
| A: Remote WebView | 1-2 weeks | Low (auto-updater only) | Negligible |
| B: Embedded Next.js | 4-8 weeks | Medium (version compat) | Moderate |
| C: React SPA | 12-20 weeks | **High** (feature parity) | **Significant** |
| D: Tauri SPA | 12-20 weeks | **High** + Rust expertise | **Significant** |
| **E: Enhanced PWA** | **1-2 weeks** | **Zero** (part of web deploy) | **None** |

### Ongoing Cost of Desktop App

For Options B-D, every new feature requires:
1. Build for web
2. Test on web
3. Adapt for desktop (if needed)
4. Test on desktop
5. Code-sign and notarize
6. Push update to auto-updater
7. Wait for users to update

This doubles feature delivery time permanently.

---

## Part 4: Technical Blockers for Electron

### 1. Server Components Cannot Run in Electron Renderer
Next.js 16 App Router relies heavily on React Server Components. These execute on the server and stream HTML to the client. Electron's renderer is a client-only environment. Every Server Component would need to be rewritten or the entire Next.js server must be embedded.

### 2. Neon PostgreSQL is Internet-Only
The database uses `@neondatabase/serverless` HTTP driver. There's no way to run Neon locally. Any "offline" story requires a secondary local database (SQLite) with sync logic — a complex engineering challenge.

### 3. Clerk Auth Requires Internet
JWT validation, session management, and user lookup all hit Clerk's servers. Offline auth would require caching sessions locally, introducing security concerns.

### 4. Stripe Checkout is Web-Only
Payment flows redirect to Stripe's hosted checkout. This works in Electron's WebView but adds complexity for deep linking back to the app.

### 5. Apple Code Signing & Notarization
Distributing a Mac app requires:
- Apple Developer account ($99/year)
- Code signing certificate
- Notarization pipeline (adds 2-10 minutes to each build)
- Hardened Runtime entitlements
- Separate CI/CD workflow

### 6. macOS App Store Guidelines
Apple explicitly rejects "apps that are simply a web page bundled as a Mac app" (Guideline 4.2). Option A would likely be rejected. Options B-D would need to demonstrate substantial native functionality.

---

## Part 5: If We Built It Anyway (Option B — Least Duplication)

### Monorepo Structure

```
Jovie/
├── apps/
│   ├── web/                    # Existing Next.js app
│   ├── desktop/                # NEW: Electron shell
│   │   ├── src/
│   │   │   ├── main/           # Electron main process
│   │   │   │   ├── index.ts    # App lifecycle, window management
│   │   │   │   ├── menu.ts     # Native menu bar
│   │   │   │   ├── tray.ts     # System tray
│   │   │   │   ├── notifications.ts
│   │   │   │   ├── updater.ts  # Auto-update via electron-updater
│   │   │   │   ├── deep-links.ts
│   │   │   │   └── ipc.ts      # IPC handlers
│   │   │   └── preload/
│   │   │       └── index.ts    # Secure IPC bridge
│   │   ├── scripts/
│   │   │   ├── build.ts        # Build script
│   │   │   └── notarize.ts     # macOS notarization
│   │   ├── resources/          # App icons, entitlements
│   │   ├── electron-builder.yml
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── should-i-make/
├── packages/
│   └── ui/                     # Shared (used by both)
```

### How It Would Work

1. **Build phase:** `pnpm --filter web build` produces standalone Next.js output
2. **Package phase:** Electron wraps the standalone output + Node.js runtime
3. **Runtime:** Electron spawns the Next.js server as a child process on a random port
4. **Window:** BrowserWindow loads `http://localhost:{port}`
5. **IPC:** Preload script exposes native APIs (notifications, tray) to the renderer

### Required Electron Dependencies

```json
{
  "dependencies": {
    "electron-updater": "^6.x",
    "electron-log": "^5.x",
    "electron-store": "^8.x"
  },
  "devDependencies": {
    "electron": "^33.x",
    "electron-builder": "^25.x",
    "@electron/notarize": "^2.x",
    "concurrently": "^9.x"
  }
}
```

### CI/CD Addition

```yaml
# .github/workflows/desktop-build.yml
- Build Next.js standalone
- Package with electron-builder
- Code sign (Developer ID)
- Notarize with Apple
- Upload to GitHub Releases / S3
- Trigger auto-updater manifest
```

### Estimated Bundle

- Chromium: ~120MB
- Node.js: ~40MB
- Next.js standalone: ~30-50MB
- App code: ~10MB
- **Total DMG: ~200-250MB**

---

## Part 6: Recommendation

### Do NOT build the Electron app. Instead, enhance the PWA.

**Reasoning:**

1. **User behavior doesn't demand it.** Jovie is a profile management tool used in short, infrequent sessions. Artists update their links, check analytics, and leave. This is not a "live in the app all day" product like Slack, VS Code, or Figma.

2. **Code duplication is unavoidable.** Even the best option (B) introduces a separate build pipeline, CI/CD workflow, and ongoing compatibility concerns. Options C/D essentially fork the frontend.

3. **Core features require internet anyway.** Database, auth, payments, and AI chat all need network connectivity. There's no meaningful offline story for Jovie's use case.

4. **PWA gives 95% of the value.** The manifest already exists with `display: standalone`. Adding a Service Worker + Web Push notifications covers the two use cases where desktop actually helps (quick access + notifications).

5. **Engineering resources are better spent elsewhere.** The time to build and maintain an Electron app (4-20+ weeks initial, ongoing forever) could instead go toward features that directly grow the business — better analytics, more integrations, improved onboarding, etc.

6. **Apple may reject it.** App Store guidelines explicitly target web wrappers (4.2). You'd need to demonstrate substantial native functionality beyond what the web offers.

### Recommended Next Steps (PWA Enhancement)

If you want the "desktop app feel" with minimal effort:

1. **Add a Service Worker** — Cache the dashboard shell and last-known data for instant loading
2. **Implement Web Push** — Native macOS notifications for analytics milestones
3. **Add install prompt** — Guide users to "Add to Dock" from the dashboard
4. **Optimize standalone mode** — Ensure the app looks and feels native when installed (hide URL bar confirmation, add custom titlebar styling)

This delivers the core desktop benefits in ~1-2 weeks with zero ongoing maintenance burden, zero code duplication, and zero new infrastructure.

---

## Part 7: When an Electron App WOULD Make Sense

Revisit this decision if any of these become true:

- **Offline-first becomes critical** (e.g., artists need to manage profiles without internet)
- **Heavy local compute** is needed (e.g., local audio/video processing, on-device AI)
- **Filesystem access** is required (e.g., uploading entire music libraries, batch operations)
- **System-level integration** is a differentiator (e.g., global keyboard shortcuts for quick profile updates, audio monitoring)
- **Enterprise customers** demand a desktop app (corporate IT policies that block web apps)
- **The product evolves** into a daily-driver tool (e.g., real-time fan messaging, live analytics dashboard)

None of these conditions exist today.
