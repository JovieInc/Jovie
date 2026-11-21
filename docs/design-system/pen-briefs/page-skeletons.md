---
frame: page-skeletons
route: /app/calendar
context: dashboard, calendar, skeleton, loading
---
Design the loading skeleton a signed-in Jovie page shows on its first load, desktop 1440 wide and mobile 390 wide, dark mode first.

The app shell is already there: sidebar, header and content canvas keep their place, and only the content canvas shows the skeleton. Each skeleton is the page itself with its content held back, not a generic placeholder. The page toolbar sits at its real height with greyed pills where its filters and buttons go. Tables keep their real header row, labels included, with quiet greyed bars in each row at the real row height. Forms keep their section header and field rows. No spinner, no shimmer sweep, no logo, no copy beyond the header labels the page already shows.

Show it on the Calendar and Links pages so the pattern reads as one system: Calendar (filter rail and a month grid of 42 day cells), Links (count in the toolbar, then a seven-column table).

When the page loads, nothing moves: the toolbar, the header row and the first row sit exactly where the skeleton drew them. Motion stays off for people who ask for reduced motion. Match the type, spacing, colors and components already in this file.
