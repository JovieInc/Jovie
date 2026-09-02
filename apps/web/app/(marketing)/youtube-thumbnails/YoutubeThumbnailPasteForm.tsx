'use client';

import { Button, Input } from '@jovie/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useId, useState } from 'react';
import { YOUTUBE_THUMBNAILS_COPY as copy } from '@/data/youtubeThumbnailsCopy';
import { cn } from '@/lib/utils';

export const YOUTUBE_THUMBNAIL_PREVIEW_ENDPOINT =
  '/api/youtube-thumbnails/preview';
export const YOUTUBE_THUMBNAIL_DEVICE_HEADER = 'x-jovie-device';
const DEVICE_STORAGE_KEY = 'jovie.youtube-thumbnails.device';

export interface YoutubeThumbnailPreviewItem {
  readonly videoId: string;
  readonly title: string;
  readonly beforeUrl: string;
  readonly afterUrl: string | null;
}

export interface YoutubeThumbnailPreviewResponse {
  readonly ok: true;
  readonly channel: {
    readonly id: string;
    readonly title: string;
    readonly handle: string | null;
  };
  /** `redo` = generated before/after; `preview_only` = redos not open yet. */
  readonly mode: 'redo' | 'preview_only';
  /** Free redos left for this visitor+channel, or null when nothing was counted. */
  readonly remaining: number | null;
  readonly items: readonly YoutubeThumbnailPreviewItem[];
}

interface YoutubeThumbnailPreviewErrorResponse {
  readonly ok: false;
  readonly code?: string;
  readonly error?: string;
}

type FormStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'invalid'
  | 'no_videos'
  | 'limit'
  | 'cooldown'
  | 'blocked'
  | 'unavailable'
  | 'error';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

interface YoutubeThumbnailPasteFormProps {
  readonly applyHref: string;
  readonly className?: string;
  /** Test seam; defaults to the runtime `fetch`. */
  readonly fetchImpl?: FetchLike;
}

/**
 * Stable per-device token so the server can count "3 free per visitor" on
 * IP + device instead of IP alone. Best effort — storage failures fall back
 * to IP-only counting on the server.
 */
function readDeviceId(): string | null {
  try {
    const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing) return existing;
    const next = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function statusFromErrorCode(status: number, code: string | undefined) {
  if (status === 400 && code === 'no_videos') return 'no_videos' as const;
  if (status === 400) return 'invalid' as const;
  if (status === 403) return 'blocked' as const;
  if (status === 429 && code === 'cooldown') return 'cooldown' as const;
  if (status === 429) return 'limit' as const;
  if (status === 503) return 'unavailable' as const;
  return 'error' as const;
}

const STATUS_COPY: Record<
  Exclude<FormStatus, 'idle' | 'ready' | 'loading'>,
  string
> = {
  invalid: copy.states.invalidChannel,
  no_videos: copy.states.noVideos,
  limit: copy.states.limitReached,
  cooldown: copy.states.cooldown,
  blocked: copy.states.blocked,
  unavailable: copy.states.unavailable,
  error: copy.states.error,
};

export function YoutubeThumbnailPasteForm({
  applyHref,
  className,
  fetchImpl,
}: Readonly<YoutubeThumbnailPasteFormProps>) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [result, setResult] = useState<YoutubeThumbnailPreviewResponse | null>(
    null
  );

  const isLoading = status === 'loading';
  const canSubmit = channel.trim().length > 0 && !isLoading;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = channel.trim();
      if (!value || isLoading) return;

      setStatus('loading');
      setResult(null);

      const doFetch: FetchLike =
        fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
      const deviceId = readDeviceId();

      try {
        const response = await doFetch(YOUTUBE_THUMBNAIL_PREVIEW_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(deviceId ? { [YOUTUBE_THUMBNAIL_DEVICE_HEADER]: deviceId } : {}),
          },
          body: JSON.stringify({ channel: value }),
        });

        const payload = (await response.json().catch(() => null)) as
          | YoutubeThumbnailPreviewResponse
          | YoutubeThumbnailPreviewErrorResponse
          | null;

        if (!response.ok || !payload || payload.ok !== true) {
          const code =
            payload && payload.ok === false ? payload.code : undefined;
          setStatus(statusFromErrorCode(response.status, code));
          return;
        }

        setResult(payload);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    },
    [channel, fetchImpl, isLoading]
  );

  const errorMessage =
    status === 'idle' || status === 'ready' || status === 'loading'
      ? null
      : STATUS_COPY[status];

  return (
    <div className={cn('flex flex-col', className)}>
      <form
        onSubmit={handleSubmit}
        className='flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center'
        data-testid='youtube-thumbnails-paste-form'
        aria-busy={isLoading}
      >
        <div className='flex-1'>
          <label htmlFor={inputId} className='sr-only'>
            {copy.form.label}
          </label>
          <Input
            id={inputId}
            name='channel'
            type='text'
            inputMode='url'
            autoComplete='off'
            spellCheck={false}
            inputSize='lg'
            placeholder={copy.form.placeholder}
            value={channel}
            onChange={event => setChannel(event.target.value)}
            aria-describedby={helperId}
            aria-invalid={status === 'invalid' || undefined}
            data-testid='youtube-thumbnails-channel-input'
            disabled={isLoading}
          />
        </div>
        <Button
          type='submit'
          variant='primary'
          size='lg'
          disabled={!canSubmit}
          loading={isLoading}
          data-testid='youtube-thumbnails-primary-cta'
          data-primary-action='true'
        >
          {copy.form.submit}
        </Button>
      </form>
      <p id={helperId} className='mt-3 text-xs text-tertiary-token'>
        {copy.form.helper}
      </p>

      {isLoading ? (
        <p
          role='status'
          className='mt-6 text-sm text-secondary-token'
          data-testid='youtube-thumbnails-status'
        >
          {copy.states.loading}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role='alert'
          className='mt-6 text-sm text-secondary-token'
          data-testid='youtube-thumbnails-error'
        >
          {errorMessage}
        </p>
      ) : null}

      {status === 'ready' && result ? (
        <PreviewResults result={result} applyHref={applyHref} />
      ) : null}
    </div>
  );
}

function PreviewResults({
  result,
  applyHref,
}: Readonly<{
  readonly result: YoutubeThumbnailPreviewResponse;
  readonly applyHref: string;
}>) {
  const headline =
    result.mode === 'preview_only'
      ? copy.states.previewOnly
      : copy.states.ready;

  return (
    <section
      aria-label={`Thumbnail preview for ${result.channel.title}`}
      className='mt-10 w-full'
      data-testid='youtube-thumbnails-results'
      data-mode={result.mode}
    >
      <p role='status' className='text-sm font-medium text-primary-token'>
        {headline}
      </p>
      {typeof result.remaining === 'number' ? (
        <p className='mt-1 text-xs text-tertiary-token'>
          {copy.states.remaining(result.remaining)}
        </p>
      ) : null}

      <ul className='mt-6 grid gap-6 md:grid-cols-3'>
        {result.items.map(item => (
          <li
            key={item.videoId}
            className='flex flex-col gap-4 border-t border-subtle pt-4'
            data-testid='youtube-thumbnails-result-item'
          >
            <p className='truncate text-sm font-medium text-primary-token'>
              {item.title}
            </p>
            <figure className='m-0'>
              <img
                src={item.beforeUrl}
                alt={`Current thumbnail for ${item.title}`}
                loading='lazy'
                className='aspect-video w-full rounded-lg bg-surface-2 object-cover'
              />
              <figcaption className='mt-2 text-2xs text-tertiary-token'>
                {copy.results.beforeLabel}
              </figcaption>
            </figure>
            <figure className='m-0'>
              {item.afterUrl ? (
                <img
                  src={item.afterUrl}
                  alt={`Jovie redo for ${item.title}`}
                  loading='lazy'
                  className='aspect-video w-full rounded-lg bg-surface-2 object-cover'
                />
              ) : (
                <div
                  role='img'
                  aria-label={copy.results.pendingLabel}
                  className='flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-1 text-xs text-tertiary-token'
                >
                  {copy.results.pendingLabel}
                </div>
              )}
              <figcaption className='mt-2 text-2xs text-tertiary-token'>
                {copy.results.afterLabel}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:items-center'>
        <Button asChild variant='primary' size='md'>
          <Link href={applyHref} data-testid='youtube-thumbnails-apply-cta'>
            {copy.results.applyCta}
          </Link>
        </Button>
        <p className='text-xs text-tertiary-token'>{copy.results.applyNote}</p>
      </div>
    </section>
  );
}
