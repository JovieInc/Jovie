---
frame: profile-analytics-card
route: /app/chat?panel=profile
context: profile, drawer, analytics
---
Design the analytics card in the artist's profile drawer, desktop 1440 wide with the drawer about 360 wide on the right, and mobile 390 wide with the drawer as a full-height sheet, dark mode first.

The card is the same summary card the release and tour-date drawers already use: two tiles side by side, Profile Views and Link Clicks, each with a small label, a large tabular number and a quiet "Last 30 days" line, then the artist's profile link in a boxed row with copy and open buttons as the card's footer.

Draw four frames of the card: loaded; loading, with skeleton tiles in exactly the loaded size so the link row never moves; no visits in the last 30 days, where one plain line replaces the two tiles and the link row stays; and analytics unavailable. No zero tiles, no fake numbers, no decorative sparkles.

Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, the sidebar is the one the app ships today: the Jovie mark with two quiet greyscale icon buttons beside it, inbox and search, 28 wide in the sidebar item colour, with no blue or filled bell and no badge count; its What's New card, if shown, keeps its editorial gradient as a plain linear gradient so it shows in the picture (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
