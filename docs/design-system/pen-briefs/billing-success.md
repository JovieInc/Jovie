---
frame: billing-success
route: /billing/success
context: billing, checkout, pricing
model: claude-opus-5-5
---
Design the screen a buyer sees right after paying for Jovie Pro, desktop 1440 wide and mobile 390 wide, dark mode first.

The headline reads just "You're on Pro" (Tim, 2026-11-22). Under it, the two or three things they can do now, each one tap away, and one primary button into their dashboard. Show their profile link with a copy action so they can share it immediately. No receipt table; Stripe emails the receipt.

Give the page one focal point (Tim, 2026-11-22: "page needs more focus"). A single centered column about 480 wide holds, in this order: a small Pro mark, the headline, one line of secondary copy, the "Go to dashboard" primary button, then the profile link row (a read-only field with a copy button beside it). The two or three next steps sit below that as quiet secondary rows in muted ink, clearly lower in the hierarchy than the primary button. Nothing else competes for the eye: no side panels, no card around the column, no stats.

Buttons are 32px tall with a flat, modest corner radius from the file's button component, not pill shaped, the "Go to dashboard" button included (Tim, 2026-11-22: "yes but 32px on buttons... the pill buttons... make flat"). No gloss, no inner shadow, no gradient on any button.

The background gradient has character and asymmetry (Tim, 2026-11-22: "the gradient needs more character and asymmetry"). Never a centered halo and never two colours blended. On the dark base, one large soft white glow sits high and well left of the column, around 25% across and 15% down, and a single thin Ion blue light line runs on a shallow diagonal from upper left to lower right behind the column, fading out at both ends, so the light reads as coming from one upper-left source. The small Pro mark gets a 1px Ion blue ring and no fill. Keep the column itself on calm, readable dark.

Calm, celebratory, no confetti. Nothing shifts after load. Match the type, spacing, colors and components already in this file.

Colour (Tim, 2026-11-22: "greys and black and white dominate. no singluar color should have heavier weight", "the ipad nano lineup on the white canvas is really what im thinking but a more nighttime cyber punk version of it", "not juicy like meat packing district coke model skinny", "the whole site should breathe that"): the page is a black, white and grey editorial world. Colour appears only as light: a 1px line, an edge, a ring, a small dot or a soft single-colour glow, never a filled block, a coloured surface, a coloured button or text set in an accent. Each coloured thing carries exactly one accent at the same weight as its peers, taken in order from the file's accent pack: Ion blue, Ultra purple, Pulse pink, then orange. Green and red mean success and failure, so they appear as accents only when six or more coloured peers show at once. Every gradient is centred on one accent value and shifts only within that hue, in lightness and strength, fading into the dark base (Tim, 2026-11-22: "they must be centered on one fo the accent colors and only hue within their own color"). A mix into a second colour is rare and deliberate, only between neighbours such as Ion blue into Ultra purple, with both ends sitting on accent values; none of these frames needs one. Grey tonal gradients are fine. Lean and sharp, not lush.

No extra carding (Tim, 2026-11-22: "make that a rule no extra carding. cards housld have intention"): draw a card only when it holds something with its own life on the page, such as a temporary notice, a movable or dismissable item, or one item in a set like a list, stack or carousel. Never wrap a page, a section, a form, a single message or an empty state in a card, and never put a card inside a card.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").
