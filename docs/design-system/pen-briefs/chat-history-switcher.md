---
frame: chat-history-switcher
route: /app/chat
context: chat, dropdown, app shell
---
Design the chat title switcher in the signed-in app header, desktop 1440 wide and mobile 390 wide, dark mode first.

The header breadcrumb shows the current chat's title, or "New Chat", followed by a small chevron. It sits exactly where the title sits today and does not move when hovered or opened; hover and open give it a quiet filled pill behind the text. Clicking it opens one dropdown panel anchored under the title, about 400 wide on desktop and the screen width minus the side gutters on mobile.

The panel has a search field pinned at the top with the placeholder "Chat History", focused when the panel opens, and a hairline below it. Under it is a scrolling list of past chats, newest first, one row per chat: the title on the left, truncated on one line, and a quiet relative age on the right in tabular figures (5m, 3d, 5w, 3mo). Rows with an unread reply carry a small accent dot in a reserved gutter to the left of the title, so titles stay aligned whether or not a row has a dot. The current chat's row is quietly selected. Show one row in its keyboard-highlighted state.

When more rows sit below the visible area the list fades out at its bottom edge; once scrolled to the end the fade is gone, and a matching fade appears at the top while rows sit above.

Draw two frames of the same switcher: the header with the closed trigger, its hover pill shown once beside it; and the open panel with the search field and the default list of past chats. The panel's list states are drawn by the chat-history-switcher-states brief.

The panel opens with a short, subtle scale and fade from the title and closes slightly faster. No icons on rows, no avatars, no section labels, no footer. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, the sidebar is the one the app ships today: the Jovie mark with two quiet greyscale icon buttons beside it, inbox and search, 28 wide in the sidebar item colour, with no blue or filled bell and no badge count; its What's New card, if shown, keeps its editorial gradient as a plain linear gradient so it shows in the picture (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
