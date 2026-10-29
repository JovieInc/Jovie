# Product design invariants

This register extends [DESIGN.md](../../DESIGN.md). Founder direction: Tim White,
2026-10-23 8:38 PM PT, JOV-8957 (art-direction P0-1).

## Secondary controls reveal without moving content

Use `HoverReveal` from `@jovie/ui` for secondary row controls. Keep their boxes
mounted at rest with opacity zero; never use display, visibility, conditional
mounting, or size changes to reveal them. The owning `group` reveals controls on
hover or keyboard focus-within. The `toolbar-filters` group supports work filter
suggestions. Focus, active presses, pressed actions, and open descendant menu
triggers retain visibility after pointer exit. Set `engaged` for controlled
selection, pending feedback, or menu state outside the subtree (including portals).
Engagement lasts while that state is active; it does not permanently latch.

Use `inverse` for the row-number layer in a reserved checkbox slot, with the same
engaged state on both layers. Keep invisible controls keyboard reachable. Existing
explicit suppression while the filter dropdown is open retains its mounted slot
and removes suggestions from the tab order. Reduced motion disables the fade.

Applied surfaces: Destinations (`DspQuietRow`), Releases ISRC/UPC/Label actions
(`DrawerEditableTextField`), table selection cells, and work filter suggestions.
The blocking `hover-reveal-invariant.test.ts` source contract runs in the existing
design-system unit guard; matching component interaction tests cover keyboard
activation, selection and suppression. Browser evidence must separately establish
paint and geometry behavior; DOM/source tests alone cannot prove rendered layout.

EVENT: Adopt one opacity-based secondary-control primitive, approved by Tim White.
