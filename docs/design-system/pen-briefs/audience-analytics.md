---
frame: audience-analytics
route: /app/contacts?tab=audience
context: audience, contacts, analytics
---
Design the Analytics rail that opens beside an artist's Audience table, desktop 1440 wide and mobile 390 wide, dark mode first.

Desktop shows the Audience table on the left with the rail pinned on the right, about 360 wide. Mobile shows the rail as a full-height sheet over the table. The rail has a title, "Audience funnel", one line under it, and a 7 day / 30 day range control. Below that, a funnel card with three rows, Profile Views, Unique Visitors and Subscribers, each with its count and a bar in the analytics accent that narrows down the funnel, then two small tiles for Link Clicks and Listen Clicks, then tabs for Cities, Countries, Sources and Links with a ranked top five list.

Draw three frames of the same rail: loaded with real-looking counts, loading with skeletons in exactly the loaded layout so nothing shifts when data arrives, and a new artist with no visits in the range. The no-visits frame drops the funnel, tiles and tabs and shows one calm empty state in their place: a quiet chart icon, the heading "No Profile Visits Yet", one sentence naming the range, and one primary button, "Share Your Profile". No fake numbers, no zero bars, no decorative sparkles.

Add a fourth frame for an artist who has visits but no city data yet. The funnel, tiles and tabs stay, the Cities tab is selected, and its list area keeps the height of five rows. In place of the rows sits the same empty anatomy at rail size: a quiet pin icon, the heading "No City Data Yet", one line saying cities appear as visitors with a known location open the profile, and when the Countries tab has data, one quiet button, "View Countries", that switches tabs.

Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").

Where the app shell shows, the sidebar is the one the app ships today: the Jovie mark with two quiet greyscale icon buttons beside it, inbox and search, 28 wide in the sidebar item colour, with no blue or filled bell and no badge count; its What's New card, if shown, keeps its editorial gradient as a plain linear gradient so it shows in the picture (Tim, 2026-11-15: "the sidebar shouldbt have teh blue bell our production code is cleaer there. gradient in whats new banner doesnt show.").
