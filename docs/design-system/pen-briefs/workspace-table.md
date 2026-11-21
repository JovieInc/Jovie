---
frame: workspace-table
route: /app/links
context: links, table, workspace
model: claude-opus-5-5
---
Design the one table every signed-in Jovie workspace uses, shown on the Links page, desktop 1440 wide and mobile 390 wide, dark mode first.

A new artist opens Links and sees every trackable link Jovie made for them: entity, type, status, destination, clicks, campaign and the Jovie link. A thin toolbar above the table carries the count ("12 links"). One header row, then dense 32px rows, all the same height. Text columns sit left, numbers sit right in tabular figures, and the header aligns with its column. Long values truncate with an ellipsis and never wrap or push a column. Status is a small quiet badge.

Show these row states as their own frames: resting, hover, keyboard focus (a visible ring inside the row, no layout change), and selected while the link's details are open in the right rail. Show the loading state: the same header and the same column widths filled with skeleton bars at row height, so nothing moves when data arrives. Show the empty state: the shared workspace empty state centered in the table area, "No Links Yet" with one sentence under it. On mobile the table scrolls sideways inside its own area and the page itself never scrolls sideways.

Every other table (contacts, audience, releases, tour dates, admin) uses this same header, row, skeleton and empty state. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, the sidebar is the one the app ships today: the Jovie mark with two quiet greyscale icon buttons beside it, inbox and search, 28 wide in the sidebar item colour, with no blue or filled bell and no badge count; its What's New card, if shown, keeps its editorial gradient as a plain linear gradient so it shows in the picture (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
