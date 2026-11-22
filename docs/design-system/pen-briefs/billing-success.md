---
frame: billing-success
route: /billing/success
context: billing, checkout, pricing
model: claude-opus-5-5
---
Design the screen a buyer sees right after paying for Jovie Pro, desktop 1440 wide and mobile 390 wide, dark mode first.

The headline reads just "You're on Pro" (Tim, 2026-11-22). Under it, the two or three things they can do now, each one tap away, and one primary button into their dashboard. Show their profile link with a copy action so they can share it immediately. No receipt table; Stripe emails the receipt.

Give the page one focal point (Tim, 2026-11-22: "page needs more focus"). A single centered column about 480 wide holds, in this order: a small Pro mark, the headline, one line of secondary copy, the "Go to dashboard" primary button, then the profile link row (a read-only field with a copy button beside it). The two or three next steps sit below that as quiet secondary rows in muted ink, clearly lower in the hierarchy than the primary button. Nothing else competes for the eye: no side panels, no second card, no stats.

Buttons are 32px tall with a flat, modest corner radius from the file's button component, not pill shaped, the "Go to dashboard" button included (Tim, 2026-11-22: "yes but 32px on buttons... the pill buttons... make flat"). No gloss, no inner shadow, no gradient on any button.

The background gradient has character and asymmetry (Tim, 2026-11-22: "the gradient needs more character and asymmetry"). Never a centered halo. Build it from two plain radial gradients on the dark base: a larger cool one (violet into deep blue) whose centre sits high and well left of the column, around 25% across and 15% down, and a smaller warm one (ember or rose) low on the right, around 80% across and 85% down, at lower strength. They overlap unevenly, so the light reads as coming from one upper-left source with a warm bounce. Keep the column itself on calm, readable dark.

Calm, celebratory, no confetti. Nothing shifts after load. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").
