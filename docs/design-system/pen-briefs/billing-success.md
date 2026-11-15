---
frame: billing-success
route: /billing/success
context: billing, checkout, pricing
---
Design the screen a buyer sees right after paying for Jovie Pro, desktop 1440 wide and mobile 390 wide, dark mode first.

The headline reads "You're on Pro: unlocked". Under it, the two or three things they can do now, each one tap away, and one primary button into their dashboard. Show their profile link with a copy action so they can share it immediately. No receipt table; Stripe emails the receipt.

Calm, celebratory, no confetti. Nothing shifts after load. Match the type, spacing, colors and components already in this file.

Compose every piece from the components already in this file, placed as instances of the design system's own button, input, chip, card, table, sidebar and banner components with their text and variants set; never redraw a control by hand or detach an instance (Tim, 2026-11-15: "make sure we compose from real atoms"). Fill backgrounds with solid colours or plain linear or radial gradients only, never image, noise, mesh or shader fills, which come out as a blank checkerboard in the exported picture (Tim, 2026-11-15: "gradient bgs dont render").
