'use client';

import { useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import {
  ActionDial,
  type ActionDialOption,
} from '@/features/release/ActionDial';

/** Tim's real release-page providers (jov.ie/tim/never-say-a-word, 2026-10-24). */
const TIM_PROVIDER_KEYS = ['spotify', 'apple_music', 'deezer'] as const;

function buildOptions(
  fixture: 'tim' | 'synthetic',
  count: number
): ActionDialOption[] {
  const keys =
    fixture === 'tim'
      ? [...TIM_PROVIDER_KEYS]
      : Object.keys(DSP_LOGO_CONFIG).slice(0, 31);
  const total = fixture === 'tim' ? keys.length : count;
  return Array.from({ length: total }, (_, index) => {
    const key = keys[index % keys.length]!;
    const logo = DSP_LOGO_CONFIG[key];
    const name = logo?.name ?? key;
    const serial = String(index + 1).padStart(3, '0');
    return {
      id: fixture === 'tim' ? key : `dest-${serial}`,
      label: fixture === 'tim' ? name : `${name} ${serial}`,
      href: `#stream-${index + 1}`,
      icon: logo?.iconPath ? (
        <svg
          viewBox='0 0 24 24'
          fill='currentColor'
          className='h-5 w-5 shrink-0'
          style={{ color: logo.color }}
          aria-hidden='true'
        >
          <path d={logo.iconPath} />
        </svg>
      ) : undefined,
    };
  });
}

/**
 * Development-only harness for the release-page service dial. Query:
 * ?fixture=tim|synthetic&count=1..200. Exposes the committed selection and
 * the Stream Now activations for Playwright.
 */
export function DevDspDialFixture({
  fixture,
  count,
}: Readonly<{ fixture: 'tim' | 'synthetic'; count: number }>) {
  const options = useMemo(() => buildOptions(fixture, count), [fixture, count]);
  const [selectedId, setSelectedId] = useState(options[0]!.id);
  const [activated, setActivated] = useState<string | null>(null);
  return (
    <main className='mx-auto min-h-dvh w-full max-w-md bg-surface-1 p-4'>
      <ActionDial
        options={options}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onActivate={setActivated}
        actionLabel='Stream Now'
        groupLabel='Choose a streaming service'
        hint='Swipe to switch. Always remembered.'
      />
      <output data-testid='dial-selected' className='sr-only'>
        {selectedId}
      </output>
      <output data-testid='dial-activated' className='sr-only'>
        {activated ?? ''}
      </output>
    </main>
  );
}
