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
      className='homepage-claim-form'
      data-testid='homepage-claim-form'
    >
      <div className='homepage-claim-input-wrap'>
        <span className='homepage-claim-prefix' aria-hidden='true'>
          jov.ie/
        </span>
        <input
          type='text'
          name='handle'
          value={handle}
          onChange={e => setHandle(e.target.value)}
          placeholder='you'
          aria-label='Choose your handle'
          className='homepage-claim-input'
          autoComplete='off'
          autoCapitalize='off'
          spellCheck={false}
        />
      </div>
      <button
        type='submit'
        data-testid='homepage-primary-cta'
        className='homepage-pill-primary'
      >
        Claim your profile
      </button>
    </form>
  );
}
