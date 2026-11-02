'use client';

import { Button } from '@jovie/ui/atoms/button';
import { CompositeField } from '@jovie/ui/atoms/composite-field';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { HOMEPAGE_SEARCH_COPY } from '@/data/homepageSearchCopy';

interface PublicMatch {
  readonly username: string;
  readonly name: string;
}

/** Read-only discovery. It never creates an account or claims a profile. */
export function HomepageNameSearch({
  action = 'Find me',
}: Readonly<{ action?: string }>) {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState<readonly PublicMatch[]>([]);
  const [state, setState] = useState<
    'idle' | 'loading' | 'found' | 'empty' | 'limited' | 'error'
  >('idle');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      input.current?.focus();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('loading');
    setMatches([]);
    try {
      const response = await fetch(
        `/api/profile/search?q=${encodeURIComponent(name.trim())}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        }
      );
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !('profiles' in data) ||
        !Array.isArray(data.profiles)
      ) {
        throw new Error('Search unavailable');
      }
      const profiles = data.profiles.filter(
        (entry: unknown): entry is PublicMatch =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              'username' in entry &&
              typeof entry.username === 'string' &&
              /^[a-zA-Z0-9_-]{1,30}$/.test(entry.username) &&
              'name' in entry &&
              typeof entry.name === 'string'
          )
      );
      if (controller.signal.aborted) return;
      setMatches(profiles);
      setState(
        profiles.length
          ? 'found'
          : 'partial' in data && data.partial === true
            ? 'limited'
            : 'empty'
      );
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }

  return (
    <search
      className='homepage-discovery'
      id='find-yourself'
      aria-label={HOMEPAGE_SEARCH_COPY.label}
    >
      <noscript>
        <p>
          <Link href='/waitlist' prefetch={false}>
            {HOMEPAGE_SEARCH_COPY.waitlist}
          </Link>
          {' · '}
          <Link href='/signin' prefetch={false}>
            {HOMEPAGE_SEARCH_COPY.invite}
          </Link>
        </p>
      </noscript>
      <form onSubmit={search}>
        <CompositeField shape='pill' size='md' surface='page'>
          <input
            id='homepage-claim-handle'
            ref={input}
            name='name'
            value={name}
            onChange={event => {
              request.current?.abort();
              setName(event.target.value);
              setMatches([]);
              setState('idle');
            }}
            aria-label={HOMEPAGE_SEARCH_COPY.label}
            placeholder={HOMEPAGE_SEARCH_COPY.placeholder}
            autoComplete='name'
            minLength={2}
            maxLength={80}
            required
            className='min-w-0 flex-1 bg-transparent text-base text-primary-token'
          />
          <Button
            type='submit'
            variant='secondary'
            size='marketing'
            disabled={state === 'loading'}
          >
            {state === 'loading' ? HOMEPAGE_SEARCH_COPY.loading : action}
          </Button>
        </CompositeField>
      </form>
      <div
        className='homepage-discovery__result'
        aria-live='polite'
        aria-busy={state === 'loading'}
      >
        {state === 'found' ? (
          <ul aria-label={HOMEPAGE_SEARCH_COPY.resultsLabel}>
            {matches.map(profile => (
              <li key={profile.username}>
                <Link
                  href={`/${encodeURIComponent(profile.username)}`}
                  className='focus-ring-themed'
                >
                  <span>{profile.name}</span>
                  <span>jov.ie/{profile.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {state === 'empty' ? <p>{HOMEPAGE_SEARCH_COPY.empty}</p> : null}
        {state === 'limited' ? <p>{HOMEPAGE_SEARCH_COPY.limited}</p> : null}
        {state === 'error' ? (
          <p role='alert'>{HOMEPAGE_SEARCH_COPY.error}</p>
        ) : null}
        {state === 'found' ||
        state === 'empty' ||
        state === 'limited' ||
        state === 'error' ? (
          <p>
            <a href='#waitlist' className='focus-ring-themed'>
              {HOMEPAGE_SEARCH_COPY.waitlist}
            </a>
            {' · '}
            <Link href='/signin' className='focus-ring-themed'>
              {HOMEPAGE_SEARCH_COPY.invite}
            </Link>
          </p>
        ) : null}
      </div>
    </search>
  );
}
