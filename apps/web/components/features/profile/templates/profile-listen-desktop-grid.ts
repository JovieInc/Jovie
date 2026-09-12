/**
 * Desktop listen-mode column contract (JOV-6201).
 *
 * Apply `PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME` on every desktop listen
 * branch. JOV-6197 may split listen content; keep this class, not `xl:360px`.
 */
export const PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME =
  'grid min-h-0 min-w-0 flex-1 items-start gap-3.5 [@media(min-width:1180px)]:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]';

export const PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME =
  'min-h-0 min-w-0 overflow-hidden isolate';

export const PROFILE_LISTEN_DSP_COLUMN_CLASSNAME = 'grid min-w-0 gap-3.5';
