'use client';

import { Button, ProgressBar } from '@jovie/ui';
import type {
  DesktopUpdateControlKind,
  DesktopUpdateControlState,
} from '@/lib/desktop/desktop-update-control-state';
import { cn } from '@/lib/utils';

export type DesktopUpdateControlIntent = 'download' | 'restart' | 'retry';

export interface DesktopUpdateControlView {
  /** Visible status line, Title Case like every other UI label. */
  readonly label: string;
  /** Polite announcement; omits the percent so progress does not chatter. */
  readonly announcement: string;
  /** Visible button label; also reserves the button's footprint when busy. */
  readonly actionLabel: string;
  /** Accessible button name, spelled out because the visible label is short. */
  readonly actionAriaLabel: string;
  readonly intent: DesktopUpdateControlIntent;
  /** The updater is working; the button shows its loading state. */
  readonly busy: boolean;
  /** The one state where acting is the point: the button reads as primary. */
  readonly primary: boolean;
}

const DOWNLOAD = {
  actionLabel: 'Download',
  actionAriaLabel: 'Download update',
  intent: 'download',
} as const;
const RESTART = {
  actionLabel: 'Restart',
  actionAriaLabel: 'Restart to update',
  intent: 'restart',
} as const;
const RETRY = {
  actionLabel: 'Retry',
  actionAriaLabel: 'Retry update',
  intent: 'retry',
} as const;

/** Copy and affordance for every visible state; `null` when hidden. */
export function describeDesktopUpdateControl(
  state: DesktopUpdateControlState
): DesktopUpdateControlView | null {
  switch (state.kind) {
    case 'hidden':
      return null;
    case 'checking':
      return {
        ...RETRY,
        label: 'Checking…',
        announcement: 'Checking for updates',
        busy: true,
        primary: false,
      };
    case 'available':
      return {
        ...DOWNLOAD,
        label: 'Update Available',
        announcement: 'Update available',
        busy: false,
        primary: false,
      };
    case 'downloading':
      return {
        ...DOWNLOAD,
        label: `Downloading ${Math.round(state.percent)}%`,
        announcement: 'Downloading update',
        busy: true,
        primary: false,
      };
    case 'ready':
      return {
        ...RESTART,
        label: 'Update Ready',
        announcement: 'Update ready, restart to update',
        busy: false,
        primary: true,
      };
    case 'restarting':
      return {
        ...RESTART,
        label: 'Restarting…',
        announcement: 'Restarting to update',
        busy: true,
        primary: true,
      };
    case 'failed':
      return {
        ...RETRY,
        label: state.retry === 'restart' ? 'Restart Failed' : 'Update Failed',
        announcement:
          state.retry === 'restart' ? 'Restart failed' : 'Update failed',
        busy: false,
        primary: false,
      };
    case 'offline':
      return {
        ...RETRY,
        label: 'No Connection',
        announcement: 'No connection, update paused',
        busy: false,
        primary: false,
      };
  }
}

/** Every state the control can paint, in lifecycle order. */
export const DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS = [
  'checking',
  'available',
  'downloading',
  'ready',
  'restarting',
  'failed',
  'offline',
] as const satisfies readonly Exclude<DesktopUpdateControlKind, 'hidden'>[];

export interface DesktopUpdateControlProps {
  readonly state: DesktopUpdateControlState;
  readonly onDownload: () => void;
  readonly onRestart: () => void;
  readonly onRetry: () => void;
  readonly className?: string;
}

/**
 * The desktop app's one update control: a status line and a single action
 * that stay put while the updater moves through its states.
 *
 * Fixed footprint: the row is always 36px tall and fills its container, the
 * status truncates, and the button keeps one width, so no state change moves
 * a neighbour. Status copy is sized for the 224px rail: every line fits
 * beside the 80px button without truncating. The button never unmounts while the control is visible, so
 * focus survives every transition. Renders nothing when hidden; the host
 * decides whether to keep the slot.
 */
export function DesktopUpdateControl({
  state,
  onDownload,
  onRestart,
  onRetry,
  className,
}: DesktopUpdateControlProps) {
  const view = describeDesktopUpdateControl(state);
  if (!view) return null;

  const act = { download: onDownload, restart: onRestart, retry: onRetry }[
    view.intent
  ];

  return (
    <div
      data-desktop-update-control=''
      data-state={state.kind}
      data-testid='desktop-update-control'
      className={cn('flex h-9 w-full min-w-0 items-center gap-1', className)}
    >
      <div className='relative flex h-full min-w-0 flex-1 items-center'>
        <p className='min-w-0 flex-1 text-xs text-primary-token'>
          {/* Keyed by state, not by label: a new state fades in once, and
              percent ticks update in place without replaying the fade. */}
          <span
            key={state.kind}
            data-part='status'
            className='block truncate tabular-nums transition-opacity duration-subtle ease-out starting:opacity-0 motion-reduce:transition-none'
          >
            {view.label}
          </span>
        </p>
        {state.kind === 'downloading' ? (
          // Overlaid under the status line, so the bar arriving and leaving
          // never moves the text or the button.
          <div
            data-part='progress'
            className='pointer-events-none absolute inset-x-0 bottom-0.5 transition-opacity duration-subtle ease-out starting:opacity-0 motion-reduce:transition-none'
          >
            <ProgressBar value={state.percent} aria-label='Download Progress' />
          </div>
        ) : null}
      </div>
      <Button
        type='button'
        size='sm'
        variant={view.primary ? 'primary' : 'secondary'}
        pendingPresentation='morph'
        loading={view.busy}
        // The status line already announces progress; keep the button quiet.
        stateLabels={{ pending: '' }}
        aria-label={view.actionAriaLabel}
        onClick={act}
        className='w-20 shrink-0'
      >
        {view.actionLabel}
      </Button>
      <span
        role='status'
        aria-live='polite'
        aria-atomic='true'
        className='sr-only tabular-nums'
      >
        {view.announcement}
      </span>
    </div>
  );
}
