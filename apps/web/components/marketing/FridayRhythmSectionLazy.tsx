'use client';

import dynamic from 'next/dynamic';

// JOV-1835: `FridayRhythmSection` is a 482-line motion-driven below-the-fold
// section. It's flag-gated off in the current CI Lighthouse run, but
// defending against TBT regressions when the flag is flipped is the
// same fix and keeps the homepage page.tsx structure consistent.
//
// `ssr: false` is forbidden in Server Components in Next 15 App Router,
// so a small client-component shim does the dynamic import.
const FridayRhythmSectionImpl = dynamic(
  () =>
    import('./friday-rhythm-section').then(m => ({
      default: m.FridayRhythmSection,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden='true'
        className='w-full'
        style={{ minHeight: 'min(96svh, 760px)' }}
      />
    ),
  }
);

export function FridayRhythmSectionLazy() {
  return <FridayRhythmSectionImpl />;
}
