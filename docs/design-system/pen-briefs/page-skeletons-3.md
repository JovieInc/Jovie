---
frame: page-skeletons-3
route: /app/settings
context: dashboard, settings, work, skeleton, loading
---
Design the loading skeleton a signed-in Jovie page shows on its first load, desktop 1440 wide and mobile 390 wide, dark mode first.

The app shell is already there: sidebar, header and content canvas keep their place, and only the content canvas shows the skeleton. Each skeleton is the page itself with its content held back, not a generic placeholder. The page toolbar sits at its real height with greyed pills where its filters and buttons go. Tables keep their real header row, labels included, with quiet greyed bars in each row at the real row height. Forms keep their section header and field rows. No spinner, no shimmer sweep, no logo, no copy beyond the header labels the page already shows.

Show it on the Settings and Work pages so the pattern reads as one system: Settings (one section header, then three field rows in the form column) and Work (stage filter chips, then the catalog table).

When the page loads, nothing moves: the toolbar, the header row and the first row sit exactly where the skeleton drew them. Motion stays off for people who ask for reduced motion. Match the type, spacing, colors and components already in this file.
