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
        'relative flex w-full max-w-[420px] flex-col items-center rounded-3xl border border-subtle bg-surface-1/60 p-6 backdrop-blur',
        className
      )}
      data-testid='voice-demo-visual'
    >
      <div className='mb-4 text-center'>
        <p className='text-xs font-medium uppercase tracking-[2px] text-tertiary-token'>
          Live demo
        </p>
        <p className='mt-1 text-sm text-secondary-token'>
          Your trained voice after YouTube clone
        </p>
      </div>

      {/* CSS Waveform (explicit, no external deps, responsive) */}
      <div
        className={cn(
          'flex h-16 w-full items-end justify-center gap-1.5 rounded-xl bg-black/40 px-6 py-3',
          isPlaying && 'voice-wave-active'
        )}
        aria-hidden='true'
      >
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={cn(
              'w-1.5 rounded-full bg-[var(--color-primary)]',
              isPlaying ? 'voice-bar-animate' : 'h-3'
            )}
            style={{
              animationDelay: isPlaying ? `${i * 80}ms` : undefined,
            }}
          />
        ))}
      </div>

      <button
        type='button'
        onClick={toggleDemo}
        className='mt-5 inline-flex items-center gap-2 rounded-full border border-subtle bg-panel px-5 py-2 text-sm font-medium text-primary-token transition hover:bg-surface-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'
        data-testid='voice-demo-play-btn'
        aria-label={isPlaying ? 'Stop voice sample' : 'Play voice sample demo'}
      >
        {isPlaying ? (
          <>
            <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]' />
            Playing sample…
          </>
        ) : (
          <>Play 4s sample (your voice)</>
        )}
      </button>

      <div className='mt-4 min-h-[2.5rem] text-center text-xs text-secondary-token'>
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

      <div className='mt-3 text-[10px] text-tertiary-token'>
        Powered by ElevenLabs • Consent-first • 1-click train
      </div>

      <style jsx>{`
        .voice-bar-animate {
          animation: voiceWave 900ms infinite ease-in-out;
        }
        @keyframes voiceWave {
          0%, 100% { height: 6px; }
          50% { height: 52px; }
        }
        .voice-wave-active > div {
          animation: voiceWave 900ms infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
