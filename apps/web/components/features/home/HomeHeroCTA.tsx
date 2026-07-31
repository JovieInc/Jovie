'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  buildClaimProfileStartHref,
  getClaimProfileIntent,
} from '@/data/marketingCtaIntents';
import { track } from '@/lib/analytics';

interface HomeHeroCTAProps {
  /** Analytics section tag. Defaults to hero. */
  readonly section?: string;
  /** When true, renders the shared free-to-start support line under the form. */
  readonly showSupport?: boolean;
}

export function HomeHeroCTA({
  section = 'hero',
  showSupport = false,
}: HomeHeroCTAProps) {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const intent = getClaimProfileIntent();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = handle.trim().replace(/^@/, '');
    track(intent.eventName, {
      section,
      handle: trimmed || undefined,
      intent: intent.id,
    });
    router.push(buildClaimProfileStartHref(trimmed));
  }

  return (
    <div className='flex w-full max-w-[26rem] flex-col items-center gap-3'>
      <form
        onSubmit={onSubmit}
        data-testid='homepage-claim-form'
        className='flex w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl'
      >
        <label className='flex h-11 flex-1 items-center rounded-full border border-white/8 bg-black/30 pl-4 pr-2'>
          <span
            aria-hidden='true'
            className='shrink-0 font-mono text-sm tracking-tighter text-white/56'
          >
            jov.ie/
          </span>
          <input
            type='text'
            name='handle'
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder='you' // ui-casing-allow: literal lowercase handle preview
            aria-label='Choose Your Handle'
            autoComplete='off'
            autoCapitalize='off'
            spellCheck={false}
            className='w-full min-w-0 bg-transparent font-mono text-sm tracking-tighter text-primary-token placeholder:text-white/36 focus:outline-none'
          />
        </label>
        <Button
          type='submit'
          variant='primary'
          size='lg'
          data-testid='homepage-primary-cta'
          className='shrink-0'
        >
          {/* ui-casing-allow: marketing hero CTA */}
          {intent.label}
        </Button>
      </form>
      {showSupport ? (
        <p
          data-testid='homepage-claim-support'
          className='text-xs font-medium tracking-wide text-tertiary-token'
        >
          {intent.support}
        </p>
      ) : null}
    </div>
  );
}
