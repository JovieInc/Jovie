# App-UI design brief — JOV-7878

The October 9 founder acceptance supersedes the October 4 bottom New Chat
placement. This brief certifies that bounded amendment in the existing shell.

## 1. IA / message

Message: Inbox / Identity / Work / Audience retain their canonical owners and
order. Expanded desktop web and packaged Mac place one compact New Chat plus
beside Today / Earlier; account controls remain in the stable footer.

## 2. Certified capabilities

Capability ids:

- artist-notifications
- artist-profiles
- cli
- public-profile
- release-launch
- smart-links

## 3. Outcome

Outcome: One visible creation action in the desktop sidebar, including empty,
loading and failed history, with no standalone compose row or surrounding capsule.
Collapsed rails and surfaces without history retain direct New Chat access.

## 4. Problem → solution

Problem: The search-slot plus competes with the history-header unread filter,
and the shared history component can add an empty-state New Chat capsule.

Solution: Relocate the canonical chat link into the history action slot. Remove
only the history-header filter and empty-state compose row. Preserve href,
modified clicks, prefetch, navigation acknowledgment, keyboard shortcuts and
conversation/draft ownership. The global history/filter surfaces remain owned
by their existing routes. Keep the command slot allocation so roots never move.

## 5. Screens and states

States:

- sidebar-rail: populated, empty, loading, error, offline
- chat-history: populated, empty, loading, error, stale, refreshing
- new-chat: empty, populated

Expanded, compact, hover/focus preview and mobile drawer are composition modes.
Populated includes Today plus Earlier and Earlier-only history. Offline and
refresh failure retain cached rows or the existing retry state.

## 6. Canonical primitives

Primitives:

- atom.button
- atom.icon-button
- component.app-shell-frame
- component.entity-sidebar

## 7. States and viewports covered

Viewports:

- sidebar-rail: mobile, tablet, desktop, mac-app
- chat-history: mobile, tablet, desktop, mac-app
- new-chat: mobile, tablet, desktop, mac-app

## 8. Art direction

Component: Existing Noir Ion shell; quiet Today / Earlier heading with a compact
plus and semantic hover/focus states, no outer action capsule. Preserve the
JOV-8017 logo/root/footer geometry and JOV-4522 / JOV-7207 motion/control owners.

## 9. Creative exploration

Pen: node OqZTF (existing sidebar reference recorded in DESIGN.md; historical
composition only, amended by October 9 acceptance). No fresh pixel approval is
claimed. Executable composition reference: UnifiedSidebar stories and
`apps/web/tests/e2e/storybook-canonical-sidebar.spec.ts`.

## 10. Build checklist

Primary task: activate New Chat once to navigate through the existing chat action.
Context: no new conversation mutation, draft reset, keyboard handler or shell
controller. Focus follows the action if a rail mode relocates it. Other focus,
selection, composer and playback owners remain intact.
Input: semantic link supports pointer, Enter and modified navigation; canonical
shortcuts remain registered. Visible focus and expanded touch hit area are
required. Reduced motion uses the existing shell behavior.
Certification: focused component tests cover action uniqueness/location through
history states and fallback modes. Real composed-shell Playwright covers light
and dark, compact/expanded/preview, repeated keyboard/pointer cycles and stable
logo/navigation/footer anchors. Browser evidence does not certify a native build.

EVENT: October 9 founder acceptance is the authority for this action placement;
no new taste decision is required. gbrain-unavailable: local service refused the
preflight query on October 15; repository source supplies ownership evidence.

The composed-shell detector also exercises the representative Ovie sidebar. Its
Lists headings use the same width/opacity staging as adjacent groups, and list
rows use the canonical 28px allocation in both rail modes. This prevents the
Utilities destinations from moving when the rail collapses.

Native taxonomy parity is tracked by [JOV-8390](https://linear.app/jovie/issue/JOV-8390):
`AppShellTabBar.swift` still lists Home/chat as a root and nests Inbox below Work.
This desktop action-placement slice does not claim that native mismatch is
resolved. Exact native/packaged-build certification remains under JOV-7710; the
local browser fixtures prove composition and interaction, not signed-in creator
data or a deployed/installed build.

## Local browser evidence

The [source hashes and capture receipt](../screenshots/jov-7878-shell/evidence.json)
bind these local fixture captures to the tested source. Playwright passed all
16 cases, including ten animated cycles per product/theme, mid-motion reversal,
reduced motion, pointer/keyboard preview and the short mobile drawer.

| State | Dark | Light |
| --- | --- | --- |
| Populated expanded | [Capture](../screenshots/jov-7878-shell/composed-history-dark-expanded.png) | [Capture](../screenshots/jov-7878-shell/composed-history-light-expanded.png) |
| Populated compact | [Capture](../screenshots/jov-7878-shell/composed-history-dark-compact.png) | [Capture](../screenshots/jov-7878-shell/composed-history-light-compact.png) |
| Populated preview | [Capture](../screenshots/jov-7878-shell/composed-history-dark-preview.png) | [Capture](../screenshots/jov-7878-shell/composed-history-light-preview.png) |
| Empty expanded | [Capture](../screenshots/jov-7878-shell/composed-empty-history-dark-expanded.png) | [Capture](../screenshots/jov-7878-shell/composed-empty-history-light-expanded.png) |

[Short mobile drawer](../screenshots/jov-7878-shell/mobile-history-short.png)
retains one directly focusable action and a 44px touch hit area.
