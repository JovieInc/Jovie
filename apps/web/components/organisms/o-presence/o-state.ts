/**
 * The O's state machine: one pure function, no React. Every input is a fact
 * the shell already knows; the first rule that matches wins (priority below).
 *
 * | id | state              | anchor      | mark   | side slot |
 * | S1 | idle               | sidebar     | circle | none      |
 * | S2 | update             | sidebar     | circle | update    |
 * | S3 | page composer      | composer    | circle | none      |
 * | S4 | floating composer  | composer    | circle | none      |
 * | S5 | now-playing flip   | sidebar     | flip   | title     |
 * | S6 | mini player        | sidebar     | play or pause | title |
 * | S7 | full player        | full-player | circle | none      |
 */

export type OStateId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';
export type OAnchor = 'sidebar' | 'composer' | 'full-player';
export type OSideSlot = 'none' | 'update' | 'title';
/** What the sidebar mark draws. `flip` is slice 5's art turn; it rests as play or pause. */
export type OMark = 'circle' | 'play' | 'pause';

export interface OStateInputs {
  /** MediaCanvasViewer owns the dock transport. */
  readonly canvasTransport: boolean;
  /** The full player is open for the active track. */
  readonly fullPlayerOpen: boolean;
  /** A track is loaded (playing or paused, not dismissed). */
  readonly audioActive: boolean;
  readonly isPlaying: boolean;
  /** The user just started this track, so the flip plays once (slice 5). */
  readonly userStartedPlay: boolean;
  /** A page composer is mounted (chat, Ovie Home). Slice 7 supplies it. */
  readonly hasPageComposer: boolean;
  /** The floating composer is open. Slice 6 supplies it. */
  readonly floatingComposerOpen: boolean;
  /** A real update landed and has something to show. */
  readonly hasUpdate: boolean;
}

export interface OState {
  readonly id: OStateId;
  readonly anchor: OAnchor;
  readonly mark: OMark;
  readonly sideSlot: OSideSlot;
  /** The sidebar O is present but inert while another surface is the transport. */
  readonly sidebarInert: boolean;
}

export const IDLE_O_INPUTS: OStateInputs = {
  canvasTransport: false,
  fullPlayerOpen: false,
  audioActive: false,
  isPlaying: false,
  userStartedPlay: false,
  hasPageComposer: false,
  floatingComposerOpen: false,
  hasUpdate: false,
};

const FULL: OState = {
  id: 'S7',
  anchor: 'full-player',
  mark: 'circle',
  sideSlot: 'none',
  sidebarInert: true,
};

export function resolveOState(input: OStateInputs): OState {
  // 0 and 1. Canvas transport and the open full player own the transport.
  if (input.canvasTransport || (input.audioActive && input.fullPlayerOpen)) {
    return FULL;
  }
  // 2. Audio loaded: the O is the mini player. The flip plays once after a
  // user-started play; auto-advance never sets `userStartedPlay`.
  if (input.audioActive) {
    return {
      id: input.userStartedPlay ? 'S5' : 'S6',
      anchor: 'sidebar',
      mark: input.isPlaying ? 'pause' : 'play',
      sideSlot: 'title',
      sidebarInert: false,
    };
  }
  // 3. Composer. A page composer wins over the floating one: only one renders.
  if (input.hasPageComposer) {
    return {
      id: 'S3',
      anchor: 'composer',
      mark: 'circle',
      sideSlot: 'none',
      sidebarInert: false,
    };
  }
  if (input.floatingComposerOpen) {
    return {
      id: 'S4',
      anchor: 'composer',
      mark: 'circle',
      sideSlot: 'none',
      sidebarInert: false,
    };
  }
  // 4. Home.
  return {
    id: input.hasUpdate ? 'S2' : 'S1',
    anchor: 'sidebar',
    mark: 'circle',
    sideSlot: input.hasUpdate ? 'update' : 'none',
    sidebarInert: false,
  };
}
