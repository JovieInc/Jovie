## Tab Keyboard Navigation

- `ArrowLeft` / `ArrowRight`: move focus to the previous or next tab, wrapping across the ends.
- `ArrowUp` / `ArrowDown`: mirror the left/right behavior for users on vertical key clusters.
- `Home` / `End`: jump directly to the first or last tab in the set.
- Activation automatically focuses the newly selected tab and updates the associated `tabpanel` via `aria-controls`/`aria-labelledby`.
- Only the active tab stays in the tab order (`tabIndex=0`), ensuring screen readers announce its selection state while inactive tabs opt out with `tabIndex=-1`.
- Implemented for `ActionDrivenProfileSectionClient` (homepage pillars) and `DashboardAnalytics` (range toggle) so keyboard-only users can operate both components without a mouse.
