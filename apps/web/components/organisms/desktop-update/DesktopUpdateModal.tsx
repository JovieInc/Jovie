'use client';

import { Button, ProgressBar } from '@jovie/ui';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { DESKTOP_UPDATE_COPY } from '@/data/supportDesktopUpdateCopy';
import type { DesktopUpdatePhase } from '@/lib/desktop/desktop-updates';

export interface DesktopUpdateReleaseNotes {
  readonly summary: string;
  readonly items: readonly string[];
}

type ActionableState = Extract<
  DesktopUpdatePhase,
  { state: 'available' | 'downloading' | 'ready' | 'error' }
>;

export interface DesktopUpdateModalViewProps {
  readonly open: boolean;
  readonly state: ActionableState;
  readonly notes: DesktopUpdateReleaseNotes | null;
  readonly loading: boolean;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  readonly onRetry: () => void;
  /** "Later" and Esc both land here. */
  readonly onLater: () => void;
}

const COPY = DESKTOP_UPDATE_COPY.modal;

const TITLES = {
  downloading: COPY.downloadingTitle,
  ready: COPY.readyTitle,
  error: COPY.errorTitle,
} as const;

export function DesktopUpdateModalView({
  open,
  state,
  notes,
  loading,
  onDownload,
  onInstall,
  onRetry,
  onLater,
}: DesktopUpdateModalViewProps) {
  // One primary action per screen: each state contributes at most one.
  const primary =
    state.state === 'available'
      ? { label: COPY.downloadAction, onClick: onDownload }
      : state.state === 'ready'
        ? { label: COPY.restartAction, onClick: onInstall }
        : state.state === 'error'
          ? { label: COPY.retryAction, onClick: onRetry }
          : null;

  return (
    <Dialog open={open} onClose={onLater} size='md'>
      <DialogTitle>
        {state.state === 'available'
          ? COPY.title(state.version)
          : TITLES[state.state]}
      </DialogTitle>
      {state.state === 'available' && state.releaseDate ? (
        <DialogDescription>{state.releaseDate.slice(0, 10)}</DialogDescription>
      ) : null}
      <DialogBody>
        {state.state === 'available' ? (
          loading ? null : notes && (notes.summary || notes.items.length) ? (
            <div className='space-y-2'>
              <h3 className='text-sm font-medium text-primary-token'>
                {COPY.notesHeading}
              </h3>
              {notes.summary ? (
                <p className='text-sm text-secondary-token'>{notes.summary}</p>
              ) : null}
              {notes.items.length > 0 ? (
                <ul className='list-disc space-y-1 pl-5 text-sm text-secondary-token'>
                  {notes.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <a
              href={state.notesUrl}
              target='_blank'
              rel='noreferrer'
              className='text-sm text-accent underline underline-offset-2'
            >
              {COPY.notesFallbackLabel}
            </a>
          )
        ) : null}
        {state.state === 'downloading' ? (
          <ProgressBar
            value={state.percent}
            aria-label={COPY.progressLabel}
            showValue
          />
        ) : null}
        {state.state === 'ready' || state.state === 'error' ? (
          <p className='text-sm text-secondary-token'>
            {state.state === 'ready'
              ? COPY.readyDescription
              : COPY.errorDescription}
          </p>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button variant='secondary' onClick={onLater}>
          {COPY.laterAction}
        </Button>
        {primary ? (
          <Button variant='primary' onClick={primary.onClick}>
            {primary.label}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function useReleaseNotes(version: string | null, enabled: boolean) {
  const [result, setResult] = useState<{
    version: string;
    notes: DesktopUpdateReleaseNotes | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !version) return;
    let cancelled = false;
    fetch(
      `/api/desktop-updates/release-notes?version=${encodeURIComponent(version)}`
    )
      .then(res => (res.ok ? res.json() : null))
      .then((body: { summary?: string; items?: readonly string[] } | null) => {
        if (cancelled) return;
        setResult({
          version,
          notes:
            body && (body.summary || (body.items?.length ?? 0) > 0)
              ? { summary: body.summary ?? '', items: body.items ?? [] }
              : null,
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ version, notes: null });
      });
    return () => {
      cancelled = true;
    };
  }, [version, enabled]);

  return {
    notes: result?.version === version ? result.notes : null,
    loading: enabled && Boolean(version) && result?.version !== version,
  };
}

export function DesktopUpdateModal({
  open,
  state,
  onDownload,
  onInstall,
  onRetry,
  onLater,
}: {
  readonly open: boolean;
  readonly state: DesktopUpdatePhase;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  readonly onRetry: () => void;
  readonly onLater: () => void;
}) {
  const version = state.state === 'available' ? state.version : null;
  const { notes, loading } = useReleaseNotes(version, open);

  if (
    state.state !== 'available' &&
    state.state !== 'downloading' &&
    state.state !== 'ready' &&
    state.state !== 'error'
  ) {
    return null;
  }

  return (
    <DesktopUpdateModalView
      open={open}
      state={state}
      notes={notes}
      loading={loading}
      onDownload={onDownload}
      onInstall={onInstall}
      onRetry={onRetry}
      onLater={onLater}
    />
  );
}
