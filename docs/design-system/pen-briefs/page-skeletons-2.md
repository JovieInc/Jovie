---
frame: page-skeletons-2
route: /app/profiles
context: dashboard, profiles, skeleton, loading
---
Design the loading skeleton a signed-in Jovie page shows on its first load, desktop 1440 wide and mobile 390 wide, dark mode first.

The app shell is already there: sidebar, header and content canvas keep their place, and only the content canvas shows the skeleton. Each skeleton is the page itself with its content held back, not a generic placeholder. The page toolbar sits at its real height with greyed pills where its filters and buttons go. Tables keep their real header row, labels included, with quiet greyed bars in each row at the real row height. No spinner, no shimmer sweep, no logo, no copy beyond the header labels the page already shows.

Show it on the Profiles and Tour Dates pages so the pattern reads as one system: Profiles (Profiles title and two toolbar buttons, then the profiles table), Tour Dates (status bar with two buttons, then the dates table).

When the page loads, nothing moves: the toolbar, the header row and the first row sit exactly where the skeleton drew them. Motion stays off for people who ask for reduced motion. Match the type, spacing, colors and components already in this file.
