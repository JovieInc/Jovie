/**
 * Canonical shell rail-motion contract (JOV-4522).
 *
 * The app shell owns allocation and main-plane geometry; rail content stages
 * its exit/entry on the same timing so sidebar, right rail, and audio dock
 * move as one system. Route code must not introduce local width/transform
 * physics for shell rails — compose these classes instead of re-declaring
 * `duration-shell-rail`/`ease-cinematic` pairs.
 *
 * `SHELL_RAIL_MOTION_MS` is the JS mirror of `--ds-motion-shell-rail-duration`
 * (design-system.css). A source-contract test keeps them in sync so the
 * phase state machine settles exactly when the CSS transition does.
 */
export const SHELL_RAIL_MOTION_MS = 220;

/** Pointer bridge grace shared by both transient desktop rails. */
export const SHELL_RAIL_PREVIEW_GRACE_MS = 180;

/** Shared rail lifecycle. Rails are interruptible: a new input re-aims the
 *  phase at the latest requested geometry instead of queueing or snapping. */
export type RailMotionPhase = 'closed' | 'opening' | 'open' | 'closing';

/**
 * Allocation slots (sidebar mount, right-rail mount, desktop drawer width).
 * flex-basis/width move the rail's footprint; opacity/transform let the slot
 * and its content travel together.
 */
export const SHELL_RAIL_ALLOCATION =
  'transition-shell-rail-allocation duration-shell-rail ease-cinematic motion-reduce:transition-none';

/** Main-plane geometry: the shell-owned surfaces that yield/reclaim canvas. */
export const SHELL_RAIL_MAIN_PLANE =
  'transition-[flex-basis,width] duration-shell-rail ease-cinematic motion-reduce:transition-none';

/** Shell-level gap/padding allocation between the rail and the main plane. */
export const SHELL_RAIL_FRAME_GAP =
  'transition-[gap,padding] duration-shell-rail ease-cinematic motion-reduce:transition-none';

/** Mobile sheet adapter: transform-only slide, no desktop allocation motion. */
export const SHELL_RAIL_SHEET =
  'transition-transform duration-shell-rail ease-cinematic motion-reduce:transition-none';

/** Directional travel staged on exiting/entering rail content (6–8px). */
export const SHELL_RAIL_TRAVEL = {
  left: '-translate-x-1.5',
  right: 'translate-x-1.5',
} as const;

/**
 * In-flow staged exit for left-rail content: the element keeps its box and
 * shrinks (max-width), fades, and drifts with the allocation so adjacent
 * siblings glide instead of snapping. Use on flex children that must leave
 * the layout progressively (header brand cluster, trailing chrome).
 */
export const SHELL_RAIL_STAGE =
  'min-w-0 max-w-full overflow-hidden transition-[max-width,opacity,transform] duration-shell-rail ease-cinematic motion-reduce:transition-none group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:pointer-events-none';

/**
 * Staged exit for single-line labels inside flex rows: max-width collapse
 * keeps the label mounted while it fades and slides, so long labels remain
 * present during the exit instead of popping to display:none at frame one.
 */
export const SHELL_RAIL_LABEL =
  'max-w-full overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-shell-rail ease-cinematic motion-reduce:transition-none group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:pointer-events-none';

/**
 * Staged exit for labels inside single-column collapsed grids: absolute
 * positioning pulls the label out of the (already collapsed) grid flow so it
 * cannot wrap to a phantom second row, while opacity + travel still stage.
 */
export const SHELL_RAIL_LABEL_OVERLAY =
  'transition-[opacity,transform] duration-shell-rail ease-cinematic motion-reduce:transition-none group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:pointer-events-none';

/**
 * Staged exit for block-level rail labels (section headers): height and
 * margin collapse with the opacity/travel so rows below rise smoothly rather
 * than jumping when the header leaves.
 */
export const SHELL_RAIL_BLOCK_LABEL =
  'max-h-8 overflow-hidden transition-[max-height,margin,opacity,transform] duration-shell-rail ease-cinematic motion-reduce:transition-none group-data-[collapsible=icon]:mb-0 group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:pointer-events-none';
