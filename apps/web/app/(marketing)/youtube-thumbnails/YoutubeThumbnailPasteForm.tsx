'use client';

import { Button, Input } from '@jovie/ui';
import Image from 'next/image';
import Link from 'next/link';
import { type FormEvent, useEffect, useId, useState } from 'react';
import {
  YOUTUBE_THUMBNAILS_COPY as copy,
  YOUTUBE_THUMBNAILS_EVENTS,
  YOUTUBE_THUMBNAILS_OPTIMIZATION,
} from '@/data/youtubeThumbnailsCopy';
import { page, track } from '@/lib/analytics';

type Item = {
  readonly videoId: string;
  readonly title: string;
  readonly beforeUrl: string;
  readonly afterUrl: string | null;
};

export function YoutubeThumbnailPasteForm({
  applyHref,
  className,
}: Readonly<{ readonly applyHref: string; readonly className?: string }>) {
  const inputId = useId();
  const [channel, setChannel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<readonly Item[] | null>(null);

  useEffect(() => {
    const context = {
      variantIdentity: YOUTUBE_THUMBNAILS_OPTIMIZATION.variantIdentity,
      platform: 'web',
      contentVariant: 'paste-channel',
    };
    page('youtube-thumbnails', context);
    track(YOUTUBE_THUMBNAILS_EVENTS.EXPOSED, context);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = channel.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      let device = window.crypto.randomUUID();
      try {
        const key = 'jovie.youtube-thumbnails.device';
        device = window.localStorage.getItem(key) ?? device;
        window.localStorage.setItem(key, device);
      } catch {
        /* IP-only */
      }
      const response = await fetch('/api/youtube-thumbnails/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-jovie-device': device,
        },
        body: JSON.stringify({ channel: value }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        items?: readonly Item[];
      } | null;
      if (!response.ok || payload?.ok !== true || !payload.items) {
        setError(
          payload?.code === 'no_videos'
            ? copy.states.noVideos
            : copy.states.invalidChannel
        );
        return;
      }
      setItems(payload.items);
    } catch {
      setError(copy.states.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <form
        onSubmit={onSubmit}
        className='flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center'
        data-testid='youtube-thumbnails-paste-form'
      >
        <label htmlFor={inputId} className='sr-only'>
          {copy.form.label}
        </label>
        <Input
          id={inputId}
          name='channel'
          type='text'
          inputSize='lg'
          placeholder={copy.form.placeholder}
          value={channel}
          onChange={event => setChannel(event.target.value)}
          data-testid='youtube-thumbnails-channel-input'
          disabled={busy}
          className='flex-1'
        />
        <Button
          type='submit'
          size='lg'
          disabled={!channel.trim() || busy}
          loading={busy}
          data-testid='youtube-thumbnails-primary-cta'
          data-primary-action='true'
        >
          {copy.form.submit}
        </Button>
      </form>
      <p className='mt-3 text-xs text-tertiary-token'>{copy.form.helper}</p>
      <p
        role={error ? 'alert' : 'status'}
        className='mt-6 min-h-5 text-sm text-secondary-token'
        data-testid={error ? 'youtube-thumbnails-error' : undefined}
      >
        {error ?? (busy ? copy.states.loading : '')}
      </p>
      {items ? (
        <section className='mt-10' data-testid='youtube-thumbnails-results'>
          <p className='text-sm font-medium text-primary-token'>
            {copy.states.previewOnly}
          </p>
          <ul className='mt-6 grid gap-6 md:grid-cols-3'>
            {items.map(item => (
              <li key={item.videoId} className='border-t border-subtle pt-4'>
                <p className='truncate text-sm font-medium'>{item.title}</p>
                <Image
                  src={item.beforeUrl}
                  alt={`${copy.results.beforeLabel}: ${item.title}`}
                  width={1280}
                  height={720}
                  unoptimized
                  className='mt-3 aspect-video w-full rounded-lg bg-surface-2 object-contain'
                />
                {item.afterUrl ? (
                  <Image
                    src={item.afterUrl}
                    alt={`${copy.results.afterLabel}: ${item.title}`}
                    width={1280}
                    height={720}
                    unoptimized
                    className='mt-3 aspect-video w-full rounded-lg bg-surface-2 object-contain'
                  />
                ) : (
                  <div className='mt-3 aspect-video rounded-lg bg-surface-1' />
                )}
              </li>
            ))}
          </ul>
          <Button asChild variant='primary' size='md' className='mt-8'>
            <Link
              href={applyHref}
              data-testid='youtube-thumbnails-apply-cta'
              onClick={() =>
                track(YOUTUBE_THUMBNAILS_EVENTS.APPLY_CLICKED, {
                  variantIdentity:
                    YOUTUBE_THUMBNAILS_OPTIMIZATION.variantIdentity,
                })
              }
            >
              {copy.results.applyCta}
            </Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
