---
frame: empty-states
route: /app/dashboard
context: dashboard, empty state
model: claude-opus-5-5
---
Design the one empty state every signed-in Jovie page uses when an account has no data yet, desktop 1440 wide and mobile 390 wide, dark mode first.

The app shell stays exactly as it is: sidebar, page toolbar and table headers keep their place, and the empty state fills the content canvas below them. It is one quiet recessed well, centered in the canvas, with a hairline border and left-aligned content: an optional small greyscale icon, a Title Case heading, one sentence that says what this page is for, and one primary button. An optional quiet text link may sit beside the button. No illustration, no sparkles, no emoji, no second filled button, no stacked helper copy.

Show it on six pages so the pattern reads as one system: Library ("No Work Yet", Sync from Spotify), Releases ("Connect Spotify"), Audience ("Grow Your Audience", Copy Profile Link), Links ("No Links Yet", Open Releases), Chats ("No Chats Yet", New Chat) and Insights ("No Insights Yet", Generate Insights). Add one frame for the Inbox, which stays a single calm centered line, "Your Inbox Is Clear", with Start A Chat.

The well reserves its height, so loading, empty and filled never shift the page. The button keeps a visible focus ring. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, the sidebar is the one the app ships today: the Jovie mark with two quiet greyscale icon buttons beside it, inbox and search, 28 wide in the sidebar item colour, with no blue or filled bell and no badge count; its What's New card, if shown, keeps its editorial gradient as a plain linear gradient so it shows in the picture (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
