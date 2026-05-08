# Design System Violation Report

Generated: 2026-05-06T18:11:00Z
Codebase: /Users/timwhite/conductor/workspaces/jovie-v1/montpellier
Scope: apps/web + packages/ui (excl. node_modules, .test.*, comments)

---

## Category 1: Emoji in JSX/TSX  [8 violations, 3 files]

**Design Rule:** DESIGN.md §Anti-Patterns — "Emoji/symbol on colored background square — explicitly banned." UI rules §No Emoji in UI — "NEVER use emoji characters in component markup."

### Production code violations:

| # | File | Line | Emoji | Context |
|---|------|------|-------|---------|
| 1 | `apps/web/app/(marketing)/launch/page.tsx` | 1418 | ☰ | Nav icon placeholder for "Releases" |
| 2 | `apps/web/app/(marketing)/launch/page.tsx` | 1419 | ☷ | Nav icon placeholder for "Audience" |
| 3 | `apps/web/app/(marketing)/launch/page.tsx` | 1420 | ✉ | Nav icon placeholder for "Threads" |
| 4 | `apps/web/app/(marketing)/launch/page.tsx` | 1450 | ■ | Nav icon placeholder for "Dashboard" |
| 5 | `apps/web/app/(marketing)/launch/page.tsx` | 1451 | ☆ | Nav icon placeholder for "Activity" |
| 6 | `apps/web/app/(marketing)/launch/page.tsx` | 1835 | ✓ | Bullet/checkmark in feature list |
| 7 | `apps/web/components/organisms/profile-notifications-menu/ProfileNotificationsMenu.tsx` | 198 | ✓ | Selected item indicator |
| 8 | `apps/web/components/features/dashboard/molecules/SetupTaskItem.tsx` | 31 | ✓ | Completion state indicator |

### Story files (exempted by UI rules but flagged):

| File | Line | Emoji |
|------|------|-------|
| `apps/web/components/organisms/HeroSection.stories.tsx` | 58 | 🚀 |
| `apps/web/components/organisms/PaySection.stories.tsx` | 113 | 🎉 |
| `apps/web/components/atoms/Input.stories.tsx` | 40 | ⚠️ |
| `apps/web/components/atoms/CTAButton.stories.tsx` | 31 | ✨ |
| `packages/ui/atoms/popover.stories.tsx` | 114,118,122 | 📧 🔗 📱 |
| `packages/ui/atoms/input.test.tsx` | 209,230 | ✓ |
| `packages/ui/atoms/badge.test.tsx` | 195 | ★ |
| `packages/ui/atoms/searchable-submenu.test.tsx` | 407 | ★ |
| `packages/ui/atoms/segment-control.test.tsx` | 426 | 🔗 |
| (plus 10 more test-file instances) | | ✓ ★ ⚡ 📎 🎧 🎵 |

---

## Category 2: Decorative Hover Motion  [8 violations, 6 files]

**Design Rule:** DESIGN.md §Product UI Taste — "Hover motion that makes panels, buttons, screenshots, or cards jump, lift, or slide for no functional reason" banned. "Hover feedback should stay visual, not positional."

### Hover translate/scale/rotate (homes positional — violate the rule):

| # | File | Line | Effect | Element |
|---|------|------|--------|---------|
| 1 | `apps/web/app/(marketing)/blog/components/BlogCard.tsx` | 25 | `hover:-translate-y-0.5` | Featured blog card |
| 2 | `apps/web/app/(marketing)/blog/components/BlogCard.tsx` | 87 | `hover:-translate-y-0.5` | Standard blog card |
| 3 | `apps/web/components/organisms/HeroSection.tsx` | 126 | `hover:-translate-y-1` | Content card with shadow |
| 4 | `apps/web/components/organisms/MarketingSignInLink.tsx` | 49 | `hover:-translate-y-[0.5px]` | Sign-in pill button |
| 5 | `apps/web/components/organisms/BlogPostPage.tsx` | 56 | `group-hover:-translate-x-1` | Back-arrow icon |
| 6 | `apps/web/app/(dynamic)/playlists/_components/PlaylistGrid.tsx` | 43 | `group-hover:scale-105` | Playlist cover image |
| 7 | `apps/web/components/features/dashboard/organisms/SmartActionCards.tsx` | 51 | `group-hover:translate-x-0.5` | Arrow icon |
| 8 | `apps/web/app/error.tsx` | 33,40 | `active:scale-[0.97]` | Error page buttons |

### Additional active:scale instances (button press feedback, borderline):

| File | Count |
|------|-------|
| `apps/web/app/exp/home-v1/page.tsx` | 5 |
| `apps/web/app/exp/auth-v1/page.tsx` | 2 |
| `apps/web/app/exp/onboarding-v1/page.tsx` | 3 |
| `apps/web/app/exp/shell-v1/page.tsx` | 2 |
| `apps/web/components/marketing/artist-profile/ShellCtaButton.tsx` | 1 |
| `apps/web/components/features/dashboard/organisms/links/ChatStyleLinkItem.tsx` | 1 |
| `apps/web/app/investor-portal/_components/DeckViewer.tsx` | 1 |
| `apps/web/lib/auth/constants.ts` | 1 |

---

## Category 3: Native Browser Dialogs  [0 violations in production]

**Design Rule:** UI rules §No Native Browser Dialogs — "NEVER use alert(...), confirm(...), or prompt(...)."

All matches were in exempted locations:
- Story files (`.stories.tsx`) — 5 alert() calls in PaySection, PaySelector, DSPButtonGroup, Card stories
- Test files — `javascript:alert(1)` in XSS sanitization tests
- Scripts (`scripts/cleanup-e2e-users.ts`) — custom `prompt()` helper, exempted
- `hooks/usePWAInstall.ts` — uses PWA `BeforeInstallPromptEvent.prompt()`, not native `window.prompt()`
- `components/jovie/SuggestedProfilesCarousel.tsx` — `confirm()` is a custom hook function, not `window.confirm()`

**Result:** No production code violations found. The existing Biome/eslint rules appear effective.

---

## Category 4: Excessive/Duplicate Borders  [10+ files flagged]

**Design Rule:** DESIGN.md §Subtraction Principle — "Borders are a supporting tool, not the main design language; if a border can be removed without losing meaning, remove it."

### Top border-heavy files (raw `border-white/XX` colors instead of design tokens):

| # | File | Instances | Notable pattern |
|---|------|-----------|-----------------|
| 1 | `apps/web/lib/design-studio/registry.tsx` | 10 | All use `border-white/10` raw value |
| 2 | `apps/web/app/hud/HudDashboardClient.tsx` | 4 | Uses `border-subtle` (canonical) |
| 3 | `apps/web/app/investor-portal/_components/InvestorNav.tsx` | 4 | Uses `var(--color-border-subtle)` |
| 4 | `apps/web/components/organisms/PersistentAudioBar.tsx` | 2 | `border border-subtle` |
| 5 | `apps/web/components/organisms/WorkspaceTabsSurface.tsx` | 2 | `border-t border-subtle` |
| 6 | `apps/web/app/app/(shell)/dashboard/contacts/loading.tsx` | 4 | `border-b border-subtle` |
| 7 | `apps/web/app/ui/layout.tsx` | 2 | `border-r border-subtle` |
| 8 | `apps/web/packages/ui/atoms/button.tsx` | 7 | All canonical `border border-subtle` |
| 9 | `apps/web/packages/ui/atoms/badge.tsx` | 5 | All canonical tokens |
| 10 | `apps/web/packages/ui/atoms/overflow-menu-trigger.tsx` | 3 | All canonical tokens |

**Note:** Most `packages/ui/atoms/` border usage is canonical and correct. The concern is in `apps/web/lib/design-studio/registry.tsx` which uses raw `border-white/10` instead of semantic border tokens.

---

## Summary

| Category | Violations | Files | Severity |
|----------|-----------|-------|----------|
| Emoji in JSX/TSX | 8 | 3 | HIGH |
| Decorative hover motion | 8 | 6 | MEDIUM |
| Native browser dialogs | 0 | 0 | CLEAN |
| Excessive/raw borders | ~30 | 10+ | LOW |

**Most common violation:** Emoji in JSX/TSX — all 8 instances are checkmarks (✓) or symbol chars (☰ ☷ ✉ ■ ☆) used as icon substitutes in place of proper SVG icons.

### Recommended lint rule / script

For emoji detection, add this to Biome's config or as a standalone script:

```json
// biome.json — add to linter rules
{
  "linter": {
    "rules": {
      "correctness": {
        "noRestrictedGlobals": "error"
      },
      "style": {
        "noRestrictedImports": "error"
      },
      "nursery": {
        "noEmojiInUI": "warn"
      }
    }
  }
}
```

Or a standalone grep check for CI:

```bash
#!/usr/bin/env bash
# .husky/check-emoji.sh — run via `pnpm lint:no-emoji`
echo "Checking for emoji in JSX/TSX..."
find apps/web packages/ui \
  -name '*.tsx' -o -name '*.ts' \
  ! -name '*.test.*' ! -name '*.stories.*' \
  ! -path '*/node_modules/*' \
  -exec grep -Pn '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' {} \+ \
  | grep -v '//.*emoji' \
  && echo "FAIL: Emoji found in UI code. Use SVG icons instead." \
  && exit 1 \
  || echo "PASS: No emoji in UI code."
```

Add to `package.json`:
```json
"scripts": {
  "lint:no-emoji": "bash .husky/check-emoji.sh"
}
```
