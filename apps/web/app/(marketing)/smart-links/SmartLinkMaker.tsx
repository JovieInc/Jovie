'use client';

import { Button } from '@jovie/ui';
import { type FormEvent, useState } from 'react';
import { linkFailureMessage } from '@/lib/smart-link-mvp/messages';

interface MakerResult {
  readonly status?: string;
  readonly code?: string;
  readonly shortUrl?: string | null;
  readonly title?: string | null;
  readonly artist?: string | null;
  readonly candidates?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly artist: string | null;
    readonly url: string | null;
  }>;
  readonly plansUrl?: string;
}

/** Server errors stay machine-readable; this surface owns their human copy. */
export function SmartLinkMaker() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MakerResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setCopied(false);
    setResult(null);
    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      setResult((await response.json()) as MakerResult);
    } catch {
      setResult({ status: 'error', code: 'UPSTREAM_FAILURE' });
    } finally {
      setPending(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className='mx-auto mt-10 max-w-xl text-left'>
      <form onSubmit={onSubmit} className='flex flex-col gap-3'>
        <label
          className='text-sm text-secondary-token'
          htmlFor='jovie-link-query'
        >
          Paste a song link or type a name
        </label>
        <input
          id='jovie-link-query'
          name='query'
          value={query}
          maxLength={300}
          required
          onChange={event => setQuery(event.target.value)}
          className='h-11 rounded-full border border-subtle bg-transparent px-4 text-base'
        />
        <Button type='submit' variant='primary' size='md' disabled={pending}>
          {pending ? 'Making your link' : 'Make my link'}
        </Button>
      </form>
      <div aria-live='polite'>
        {result?.shortUrl ? (
          <div className='mt-6 flex flex-wrap items-center gap-3'>
            <a href={result.shortUrl} className='underline'>
              {result.shortUrl}
            </a>
            <Button
              type='button'
              variant='secondary'
              size='md'
              onClick={() => copy(result.shortUrl!)}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : null}
        {result?.status === 'needs_choice' ? (
          <ul className='mt-6 space-y-2 text-sm'>
            {(result.candidates ?? []).map(candidate => (
              <li key={candidate.id}>
                <button
                  type='button'
                  className='underline'
                  onClick={() => {
                    if (candidate.url) setQuery(candidate.url);
                  }}
                >
                  {candidate.name}
                  {candidate.artist ? ` — ${candidate.artist}` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {linkFailureMessage(result?.code) ? (
          <p className='mt-6 text-sm text-secondary-token'>
            {linkFailureMessage(result?.code)}
          </p>
        ) : null}
        {result?.code === 'LIMIT_REACHED' && result.plansUrl ? (
          <p className='mt-2 text-sm text-secondary-token'>
            <a href={result.plansUrl}>See Jovie plans</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
