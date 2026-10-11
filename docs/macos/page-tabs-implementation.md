# Approved Mac page tabs — 2026-10-10

Scope approval: voice user message `01a1283c-ff77-7b61-88ed-c3c2139aa330`
in chat `01a1282b-46fe-7af3-a1c5-c0ae9d5f1faf`. The page strip belongs only
to the main column, above its existing header. Sidebar icons stay on the red
traffic light's center axis through expansion and collapse. Preserve route
content, shared Jovie/Ovie identity, authentication and update protections.

## Adopt-first boundary

**Compose** the pinned Electron runtime's maintained `WebContentsView` with
the existing BrowserWindow, preload, app shell and navigation coordinator.
Electron is MIT licensed and already part of the shipping stack; no new
service, external data transfer, credential store or runtime dependency.
Official API: https://www.electronjs.org/docs/latest/api/web-contents-view
and lifetime contract: https://www.electronjs.org/docs/latest/api/base-window#resource-management.
Independent live browsing contexts preserve per-page Next router, history,
draft/caret and scroll state. Route-button tabs cannot provide that boundary.
Native window tabbing cannot confine its strip to the column beside the rail.
Revisit the host composition at the documented native Mac parity cutover.

## Interaction and preservation contract

- Primary task: open an independent page with the visible plus button; select
  it with one click; close it with its visible close button. One tab fills the
  available strip; multiple tabs share it equally. Overflow remains horizontal
  scrolling rather than hiding controls. Tabs last for the window lifetime;
  this change does not persist private page titles or drafts to a new store.
- Switching keeps the previous document alive, including draft text, selection,
  scroll, navigation history and ongoing work. Focus goes to the requested
  page or its selected tab as appropriate. Sidebar geometry remains shared.
- Closing potentially active/unsent/unknown work requires an explicit native
  confirmation. Cancel keeps the tab/document intact. Closing the last page
  opens a fresh page before releasing the old one.
- Idle, loading, loaded, offline/load-failure and crashed renderer states keep
  the strip allocation fixed. Existing per-document watchdog/retry owns page
  recovery. Background visual suspension never stops session work.
- Pointer controls are always visible. Tablist implements arrows/Home/End
  and Delete only on its tab controls; page editors retain their keys. Native
  menu shortcuts are discoverable in File. Reduced motion disables rail
  animation. Existing tokens, focus rings and accessible names remain owners.
- Check expanded/collapsed/preview, light/dark, 800px and wider Mac windows,
  zoom, page navigation/back/forward, independent unsent drafts, stream/work
  retention, close/cancel, recovery and native traffic-light/drag controls.

Evidence remains required from the real repository runners, coverage and the
staging Mac app. Source tests and browser renders alone cannot qualify delivery.
GBrain canonical design read succeeded after network access was available:
`design/mac-shell-safari-page-tabs-and-anchored-sidebar-2026-10-10`. The actual
human approval transcript was independently verified before implementation.

## Native chrome and recovery

The strip reuses DesktopPageTabsView in a separate sandboxed, bundled local
WebContentsView above the selected hosted document. It survives that document
crashing or loading the existing recovery page. No remote script, new dependency
or credential copy is involved. Only the owned exact local main frame and owned
app-origin main frames can issue tab commands; only the selected app document
can report geometry. Bounds convert CSS pixels at the current page zoom into
native window points and reserve all three traffic lights. Appearance has an
initial read plus subscription so a slow local strip cannot miss theme state.

Native zoom commands target the selected document even while tab chrome has
keyboard focus. Electron menu roles target the focused WebContents and ignore
custom click handlers, so these three menu actions retain their standard labels
and shortcuts with explicit selected-document routing. Other native menu roles
remain unchanged. Reference: https://www.electronjs.org/docs/latest/api/menu-item.

This foundation adds lifecycle/bounds coverage to the real desktop test chain.
The native integration layer must add execution of the actual IPC registration
bodies and an isolated native Electron fixture before qualification.
The source-only developer QA opt-in is used only for that synthetic profile;
packaged remote-debugging protection remains enforced. Native fixture success
is separate from authenticated staging Mac acceptance.
