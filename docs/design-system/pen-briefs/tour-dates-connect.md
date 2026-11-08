---
frame: tour-dates-connect
route: /app/tour-dates
---
Design the Tour Dates page for an artist who has not connected Bandsintown yet, desktop 1440 wide and mobile 390 wide, dark mode first.

The app shell stays exactly as it is, and the empty state is the same one every signed-in Jovie page uses: one quiet recessed well, centered in the content canvas, with a hairline border and left-aligned content. A small greyscale calendar icon, the Title Case heading "Connect Your Tour Dates", one sentence saying Jovie syncs upcoming shows from the artist's Bandsintown name, then one text field for that name and one full-width primary button, "Connect Bandsintown". No illustration, no second button, no stacked helper copy.

Add a second frame for the rarer case where no Bandsintown API key is configured: a key icon, "Set Up Bandsintown Integration", one sentence on where to generate the key, a password field, the primary button "Save API Key", and one small line under it linking to the Bandsintown artist site and saying the key is encrypted.

The well reserves its height while connecting, so the button's pending label never moves the page. The field and button keep visible focus rings. Match the type, spacing, colors and components already in this file.
