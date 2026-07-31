'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface VoiceDemoVisualProps {
  readonly className?: string;
}

export function VoiceDemoVisual({ className }: Readonly<VoiceDemoVisualProps>) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(0);

  const toggleDemo = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) {
      setPlayCount(c => c + 1);
      // Auto-stop after 4s for demo (no real audio asset in HOT ZONE)
      window.setTimeout(() => {
        setIsPlaying(false);
      }, 4000);
    }
  };

  return (
    <div
      className={cn(
        'system-b-voice-demo relative flex w-full flex-col items-center rounded-3xl border border-subtle p-6',
        className
      )}
      data-testid='voice-demo-visual'
    >
      <div className='mb-4 text-center'>
        <p className='text-xs font-medium uppercase tracking-widest text-tertiary-token'>
          Live demo
        </p>
        <p className='mt-1 text-sm text-secondary-token'>
          Your trained voice after YouTube clone
        </p>
      </div>

      {/* CSS Waveform (explicit, no external deps, responsive) */}
      <div
        className={cn(
          'system-b-voice-demo-wave flex h-16 w-full items-end justify-center gap-1.5 rounded-xl px-6 py-3',
          isPlaying && 'system-b-voice-demo-wave--active'
        )}
        aria-hidden='true'
      >
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className='system-b-voice-demo-wave-bar w-1.5 rounded-full'
          />
        ))}
      </div>

      <button
        type='button'
        onClick={toggleDemo}
        className='focus-ring-themed mt-5 inline-flex items-center gap-2 rounded-full border border-subtle bg-panel px-5 py-2 text-sm font-medium text-primary-token transition-colors hover:bg-surface-1'
        data-testid='voice-demo-play-btn'
        aria-label={isPlaying ? 'Stop voice sample' : 'Play voice sample demo'}
      >
        {isPlaying ? (
          <>
            <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-primary-token motion-reduce:animate-none' />
            Playing sample…
          </>
        ) : (
          <>Play 4s sample (your voice)</>
        )}
      </button>

      <div className='mt-4 min-h-10 text-center text-xs text-secondary-token'>
        {isPlaying ? (
          <span data-testid='voice-demo-transcript'>
            “Hey fans — this drop is powered by my Jovie voice clone.”
          </span>
        ) : playCount > 0 ? (
          <span>
            Thanks — that was cloned from a 90s YouTube interview clip.
          </span>
        ) : (
          <span>Trained on your cadence, tone, and delivery.</span>
        )}
      </div>

      <ul className='mt-3 flex flex-wrap justify-center text-3xs text-tertiary-token'>
        {['Powered by ElevenLabs', 'Consent-first', '1-click train'].map(
          (item, index) => (
            <li
              key={item}
              className={cn(index > 0 && 'ml-2 border-l border-subtle pl-2')}
            >
              {item}
            </li>
          )
        )}
      </ul>
    </div>
  );
}
