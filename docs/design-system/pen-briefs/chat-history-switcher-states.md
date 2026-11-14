---
frame: chat-history-switcher-states
route: /app/chat
context: chat, dropdown, app shell
---
Design the list states of the chat history switcher panel, desktop 1440 wide and mobile 390 wide, dark mode first.

The panel is the one the chat-history-switcher brief draws, anchored under the header title, about 400 wide on desktop and the screen width minus the side gutters on mobile, with a search field pinned at the top with the placeholder "Chat History" and a hairline below it, and a scrolling list of past chats under it, newest first, one row per chat: the title on the left, truncated on one line, and a quiet relative age on the right in tabular figures (5m, 3d, 5w, 3mo).

Draw four frames of the same panel: a list filtered by a search, with the search text in the field; "No Matching Chats"; "No Chats Yet"; and a loading state that keeps the panel's height.

When more rows sit below the visible area the list fades out at its bottom edge; once scrolled to the end the fade is gone, and a matching fade appears at the top while rows sit above. No icons on rows, no avatars, no section labels, no footer. Match the type, spacing, colors and components already in this file.
