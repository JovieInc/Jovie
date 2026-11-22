---
frame: workspace-table-states
route: /app/links
context: links, table, workspace, loading, empty
model: claude-opus-5-5
---
Design the states of the one table every signed-in Jovie workspace uses, shown on the Links page, desktop 1440 wide, dark mode first.

The table is the one the workspace-table brief draws: a thin toolbar carrying, from the left, the filter button, the search field and the count ("12 links"), with the inbox bell at its right end; one header row, then dense 32px rows of entity, type, status, destination, clicks, campaign and the Jovie link. Text columns sit left, numbers sit right in tabular figures, long values truncate with an ellipsis, and the status badge column is wide enough for "Scheduled". Draw exactly one header row per frame.

Draw three frames, each the table in the content area with the app shell around it:

- Selected, with the link's details open in the right rail. The rail shows the selected link itself: its entity name, type, the Jovie link in the body font (jov.ie/neon-skyline for a row named Neon Skyline) and that row's own clicks, never a profile card or zero placeholder. With the rail open the table keeps its columns legible by dropping the lowest-priority columns (campaign, then destination) rather than squeezing them, and no stray dividers appear between columns.
- Loading: the same header and the same column widths filled with skeleton bars at row height, so nothing moves when data arrives. Keep it as the last draft drew it (Tim, 2026-11-22: "good loading").
- Empty: the shared workspace empty state centered in the table area, "No Links Yet" with one sentence under it, on one quiet flat panel.

Keep every surface and control flat (Tim, 2026-11-22: "flat"): no drop or inset shadows, no glows, no bevels and no gradients on rows, badges, the toolbar, the rail or buttons; buttons are the file's flat button at 32px tall with a modest corner radius, never pills. The What's New card keeps its approved gradient.. Every other table (contacts, audience, releases, tour dates, admin) uses this same header, row, skeleton and empty state. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, search lives in the page toolbar as its search field, and the sidebar drops its search button: the sidebar shows the Jovie mark alone at its top. Inbox moves to one quiet greyscale bell icon button, 28 wide, at the top right of the page toolbar, with no fill, no blue and no badge count (Tim, 2026-11-22: "i like this for search and killing the search btton up top then you can use a bell top right for inbox"). The sidebar otherwise stays the one the app ships today; its What's New card, if shown, gets its own fill set on the instance: a plain linear gradient from the deep indigo of the editorial gradient at the top left to near-black at the bottom right. The library's What's New section has no fill of its own and only looks dark from the page behind it, so an instance left without a fill exports as a see-through checkerboard. The Inbox item carries no count badge, blue or otherwise (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
