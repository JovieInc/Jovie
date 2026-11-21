'use client';

import { Button, Input } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { buildHomepageClaimEntryHref } from '@/data/homepageClaimEntry';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import {
  CLAIM_PROFILE_STARTER_PROMPT,
  getClaimProfileIntent,
} from '@/data/marketingCtaIntents';

/**
 * Homepage close claim field. Valid handles keep `handle=`; display names
 * (spaces / invalid handle chars) become a Spotify-search starter without
 * poisoning identity as a handle (JOV-10127 entry hygiene).
 */
export function HomepageClaimEntryForm() {
  const claim = HOMEPAGE_EDITORIAL_COPY.claim;
  const intent = getClaimProfileIntent();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [navigating, setNavigating] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigating) return;
    const value = inputRef.current?.value ?? '';
    setNavigating(true);
    router.push(buildHomepageClaimEntryHref(value));
  }

  return (
    <form
      method='get'
      action={intent.href}
      onSubmit={onSubmit}
      data-testid='homepage-claim-entry'
      className='hv3-claim'
      noValidate
      aria-busy={navigating}
    >
      <Input
        type='hidden'
        name='starter_prompt'
        value={CLAIM_PROFILE_STARTER_PROMPT}
      />
      <label className='hv3-claim__label' htmlFor='homepage-claim-entry-handle'>
        {claim.handleLabel}
      </label>
      <Input
        ref={inputRef}
        id='homepage-claim-entry-handle'
        name='handle'
        type='text'
        autoComplete='off'
        spellCheck={false}
        maxLength={80}
        placeholder={claim.handlePlaceholder}
        aria-label={claim.handleLabel}
        // Progressive enhancement: no-JS native GET rejects spaces / illegal
        // chars so `handle=Taylor+Swift` never lands. Client submit converts
        // those values into a Spotify-search starter instead.
        pattern='[A-Za-z0-9._-]{3,30}'
        title='Use letters, numbers, dots, underscores, or hyphens (3–30). Or leave blank and find yourself on Spotify in chat.'
      />
      <Button
        type='submit'
        data-testid='homepage-close-cta'
        disabled={navigating}
        aria-busy={navigating}
      >
        {intent.label}
      </Button>
    </form>
  );
}
