'use client';

import { Button, LoadingSkeleton, ProgressBar } from '@jovie/ui';
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
  /** Version being installed; kept through the download, which carries none. */
  readonly version?: string | null;
  readonly notes: DesktopUpdateReleaseNotes | null;
  readonly loading: boolean;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  readonly onRetry: () => void;
  /** "Later" and Esc both land here. */
  readonly onLater: () => void;
}

const COPY = DESKTOP_UPDATE_COPY.modal;

const MB = 1024 * 1024;
function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

function formatReleaseDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso.slice(0, 10)
    : date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
}

export function DesktopUpdateModalView({
  open,
  state,
  version = null,
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
        : state.state === 'error' && state.retryable
          ? { label: COPY.retryAction, onClick: onRetry }
          : null;

  const title =
    state.state === 'available'
      ? COPY.availableTitle(state.version)
      : state.state === 'downloading'
        ? COPY.downloadingTitle(version)
        : state.state === 'ready'
          ? COPY.readyTitle(state.version)
          : COPY.errorTitle;

  const description =
    state.state === 'available'
      ? state.releaseDate
        ? COPY.released(formatReleaseDate(state.releaseDate))
        : null
      : state.state === 'downloading'
        ? COPY.downloadingDescription
        : state.state === 'ready'
          ? COPY.readyDescription
          : state.retryable
            ? COPY.errorDescription
            : COPY.errorFinalDescription;

  return (
    <Dialog open={open} onClose={onLater} size='sm'>
      <DialogTitle>{title}</DialogTitle>
      {description ? (
        <DialogDescription>{description}</DialogDescription>
      ) : null}

      {state.state === 'available' ? (
        <DialogBody data-testid='desktop-update-notes'>
          {loading ? (
            // Reserve the notes block so the dialog does not grow on load.
            <div aria-hidden='true'>
              <LoadingSkeleton lines={3} height='h-3' />
            </div>
          ) : notes && (notes.summary || notes.items.length) ? (
            <div className='space-y-2'>
              <h3 className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
                {COPY.notesHeading}
              </h3>
              {notes.summary ? (
                <p className='text-app leading-relaxed text-secondary-token'>
                  {notes.summary}
                </p>
              ) : null}
              {notes.items.length > 0 ? (
                <ul className='max-h-48 list-disc space-y-1 overflow-y-auto pl-4 text-app leading-relaxed text-secondary-token marker:text-tertiary-token'>
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
              className='text-app text-secondary-token underline underline-offset-2 hover:text-primary-token'
            >
              {COPY.notesFallbackLabel}
            </a>
          )}
        </DialogBody>
      ) : null}

      {state.state === 'downloading' ? (
        <DialogBody className='space-y-1.5'>
          <ProgressBar value={state.percent} aria-label={COPY.progressLabel} />
          <div className='flex items-center justify-between gap-3 text-2xs tabular-nums text-tertiary-token'>
            <span>
              {state.totalBytes > 0
                ? COPY.transferred(
                    formatMegabytes(state.transferredBytes),
                    formatMegabytes(state.totalBytes)
                  )
                : `${Math.round(state.percent)}%`}
            </span>
            {state.bytesPerSecond > 0 ? (
              <span>{COPY.speed(formatMegabytes(state.bytesPerSecond))}</span>
            ) : null}
          </div>
        </DialogBody>
      ) : null}

      <DialogActions>
        <Button variant='secondary' onClick={onLater}>
          {state.state === 'downloading' ? COPY.hideAction : COPY.laterAction}
        </Button>
        {primary ? (
          // Focus the one primary action so Return confirms it.
          <Button variant='primary' onClick={primary.onClick} autoFocus>
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
  // The download phase carries no version; keep the one the user accepted.
  const [lastVersion, setLastVersion] = useState<string | null>(null);
  const knownVersion =
    state.state === 'available' || state.state === 'ready'
      ? state.version
      : null;
  useEffect(() => {
    if (knownVersion) setLastVersion(knownVersion);
  }, [knownVersion]);

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
      version={lastVersion}
      notes={notes}
      loading={loading}
      onDownload={onDownload}
      onInstall={onInstall}
      onRetry={onRetry}
      onLater={onLater}
    />
  );
}
