'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

export function HomeHeroCTA() {
  const router = useRouter();
  const [handle, setHandle] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = handle.trim().replace(/^@/, '');
    track('landing_cta_claim_profile', {
      section: 'hero',
      handle: trimmed || undefined,
    });
    const params = trimmed ? `?handle=${encodeURIComponent(trimmed)}` : '';
    router.push(`${APP_ROUTES.SIGNUP}${params}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid='homepage-claim-form'
      className='flex w-full max-w-[26rem] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl'
    >
      <label className='flex h-11 flex-1 items-center rounded-full border border-white/8 bg-black/30 pl-4 pr-2'>
        <span
          aria-hidden='true'
          className='shrink-0 font-mono text-[14px] tracking-[-0.02em] text-white/56'
        >
          jov.ie/
        </span>
        <input
          type='text'
          name='handle'
          value={handle}
          onChange={e => setHandle(e.target.value)}
          placeholder='you'
          aria-label='Choose your handle'
          autoComplete='off'
          autoCapitalize='off'
          spellCheck={false}
          className='w-full min-w-0 bg-transparent font-mono text-[14px] tracking-[-0.02em] text-primary-token placeholder:text-white/36 focus:outline-none'
        />
      </label>
      <button
        type='submit'
        data-testid='homepage-primary-cta'
        className='inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-5 text-[13px] font-semibold tracking-[-0.02em] text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
      >
        Claim your profile
      </button>
    </form>
  );
}
