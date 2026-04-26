'use client';

// ---------------------------------------------------------------------------
// Auth V1 — single route, mode toggle (signin ⇄ signup). Cold-start vocab:
// bloom mark + eased fade-in, Carbon palette, no chrome. The card is the
// hero — the canvas around it stays calm so the work happens at the input.
// Hand-off: signup → /exp/onboarding-v1, signin → /exp/shell-v1.
// ---------------------------------------------------------------------------

import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

const CARBON_VARS: React.CSSProperties = {
  ['--linear-bg-page' as string]: '#06070a',
  ['--linear-app-content-surface' as string]: '#0a0c0f',
  ['--linear-app-shell-border' as string]: '#171a20',
  ['--surface-0' as string]: '#0a0b0e',
  ['--surface-1' as string]: '#101216',
  ['--surface-2' as string]: '#161a20',
  ['--text-primary' as string]: 'rgba(255,255,255,0.92)',
  ['--text-secondary' as string]: 'rgba(255,255,255,0.66)',
  ['--text-tertiary' as string]: 'rgba(255,255,255,0.46)',
  ['--text-quaternary' as string]: 'rgba(255,255,255,0.32)',
};

type Mode = 'signin' | 'signup';
type Step = 'email' | 'otp' | 'success';

export default function AuthV1Page() {
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step === 'email') emailRef.current?.focus();
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setStep('otp');
    }, 600);
  }

  function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setStep('success');
      // Hand-off — signup → onboarding, signin → shell
      const dest = mode === 'signup' ? '/exp/onboarding-v1' : '/exp/shell-v1';
      setTimeout(() => {
        window.location.href = dest;
      }, 700);
    }, 600);
  }

  return (
    <div
      className='auth-v1 min-h-dvh w-full bg-(--linear-bg-page) text-primary-token grid lg:grid-cols-2'
      style={{
        ...CARBON_VARS,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(0.985)',
        transition: `opacity 600ms ${EASE_CINEMATIC}, transform 600ms ${EASE_CINEMATIC}`,
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      }}
    >
      <style>{`
        .auth-v1 :focus { outline: none; }
        .auth-v1 :focus-visible {
          outline: 1.5px solid rgba(103, 232, 249, 0.45);
          outline-offset: 1px;
          border-radius: 4px;
        }
      `}</style>

      {/* Left half — auth card. Centered vertically + horizontally. */}
      <div className='min-h-dvh grid place-items-center px-6 py-10'>
        <div className='w-full max-w-[360px] flex flex-col items-center text-center'>
          <JovieMark className='h-9 w-9 text-primary-token mb-6' />

          <h1
            className='text-[24px] font-semibold leading-tight'
            style={{ letterSpacing: '-0.02em' }}
          >
            {step === 'email'
              ? mode === 'signup'
                ? 'Create your account'
                : 'Welcome back'
              : step === 'otp'
                ? 'Check your email'
                : 'You’re in'}
          </h1>
          <p className='mt-2 text-[13px] text-tertiary-token max-w-[320px]'>
            {step === 'email'
              ? mode === 'signup'
                ? 'A passwordless link to set up your artist workspace.'
                : 'Sign in with the email you used to set up Jovie.'
              : step === 'otp'
                ? `We sent a six-digit code to ${email}.`
                : mode === 'signup'
                  ? 'Taking you to onboarding…'
                  : 'Taking you to your dashboard…'}
          </p>

          <div className='mt-8 w-full'>
            {step === 'email' && (
              <form onSubmit={onSubmitEmail} className='flex flex-col gap-3'>
                <label className='block text-left'>
                  <span className='block text-[10.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold mb-1.5'>
                    Email
                  </span>
                  <input
                    ref={emailRef}
                    type='email'
                    required
                    autoComplete='email'
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder='you@artistdomain.com'
                    className='w-full h-10 px-3 rounded-md bg-(--surface-1)/80 border border-(--linear-app-shell-border) text-[14px] text-primary-token placeholder:text-quaternary-token outline-none focus:border-cyan-400/50 transition-colors duration-150 ease-out'
                  />
                </label>
                <ContinueButton submitting={submitting}>
                  Continue
                </ContinueButton>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={onSubmitOtp} className='flex flex-col gap-3'>
                <div className='block text-left'>
                  <span className='block text-[10.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold mb-1.5'>
                    Verification code
                  </span>
                  <OtpInput value={otp} onChange={setOtp} firstRef={otpRef} />
                </div>
                <ContinueButton submitting={submitting}>
                  {mode === 'signup' ? 'Create account' : 'Sign in'}
                </ContinueButton>
                <button
                  type='button'
                  onClick={() => setStep('email')}
                  className='text-[11.5px] text-tertiary-token hover:text-primary-token mt-1 transition-colors duration-150 ease-out'
                >
                  Use a different email
                </button>
              </form>
            )}

            {step === 'success' && (
              <div className='inline-flex items-center gap-2 text-[12.5px] text-tertiary-token'>
                <Loader2
                  className='h-3.5 w-3.5 animate-spin'
                  strokeWidth={2.25}
                />
                Redirecting…
              </div>
            )}
          </div>

          {step === 'email' && (
            <p className='mt-8 text-[12px] text-tertiary-token'>
              {mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    type='button'
                    onClick={() => setMode('signin')}
                    className='text-secondary-token hover:text-primary-token underline decoration-quaternary-token/60 underline-offset-[3px] hover:decoration-cyan-300/70 transition-colors duration-150 ease-out'
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  New to Jovie?{' '}
                  <button
                    type='button'
                    onClick={() => setMode('signup')}
                    className='text-secondary-token hover:text-primary-token underline decoration-quaternary-token/60 underline-offset-[3px] hover:decoration-cyan-300/70 transition-colors duration-150 ease-out'
                  >
                    Create account
                  </button>
                </>
              )}
            </p>
          )}

          <p className='mt-12 text-[10.5px] text-quaternary-token'>
            By continuing you agree to the{' '}
            <a
              href='https://jov.ie/terms'
              className='underline decoration-quaternary-token/40 underline-offset-[3px] hover:text-tertiary-token transition-colors duration-150 ease-out'
            >
              terms
            </a>{' '}
            and{' '}
            <a
              href='https://jov.ie/privacy'
              className='underline decoration-quaternary-token/40 underline-offset-[3px] hover:text-tertiary-token transition-colors duration-150 ease-out'
            >
              privacy policy
            </a>
            .
          </p>
        </div>
      </div>

      {/* Right half — product bento. Hidden below lg. */}
      <div className='hidden lg:flex min-h-dvh items-stretch p-6'>
        <BentoShowcase />
      </div>
    </div>
  );
}

function BentoShowcase() {
  return (
    <div className='flex-1 flex flex-col rounded-[var(--linear-app-shell-radius,12px)] border border-(--linear-app-shell-border) bg-(--surface-1)/60 px-12 py-14 overflow-hidden'>
      <div className='shrink-0'>
        <span className='text-[10.5px] uppercase tracking-[0.12em] text-quaternary-token font-semibold'>
          Built for artists
        </span>
        <h2
          className='mt-2 text-[28px] font-semibold leading-tight text-primary-token max-w-[420px]'
          style={{ letterSpacing: '-0.02em' }}
        >
          The studio that ships releases for you.
        </h2>
        <p className='mt-3 text-[13.5px] text-tertiary-token max-w-[400px] leading-relaxed'>
          Jovie writes pitches, schedules drops, generates reels and lyric
          clips, and tells you what to ship next. You make the music.
        </p>
      </div>

      {/* Product mock — Carbon palette stand-in for a screenshot. */}
      <div className='mt-8 flex-1 grid place-items-center'>
        <ProductMock />
      </div>

      {/* Trust bar — uppercase label + grayscale initial avatars. */}
      <div className='shrink-0 mt-8 pt-6 border-t border-(--linear-app-shell-border)/70'>
        <p className='text-[10.5px] uppercase tracking-[0.12em] text-quaternary-token font-semibold mb-3'>
          Trusted by artists
        </p>
        <div className='flex items-center gap-2'>
          {['BA', 'TW', 'SD', 'LF', 'GE', 'EC'].map(id => (
            <span
              key={id}
              className='h-7 w-7 rounded-full grid place-items-center text-[10.5px] font-medium text-tertiary-token bg-(--surface-2)/70 border border-(--linear-app-shell-border)'
            >
              {id}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductMock() {
  // Stand-in for a real screenshot — Carbon palette scene with a sidebar
  // strip + canvas tiles. Keeps the bento honest without a binary asset
  // dependency. Replace with a real screenshot import later.
  return (
    <div className='w-full max-w-[520px] aspect-[16/10] rounded-lg border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden grid grid-cols-[80px_1fr]'>
      {/* sidebar strip */}
      <div className='border-r border-(--linear-app-shell-border)/70 bg-(--surface-0)/60 p-2 flex flex-col gap-1.5'>
        {[0, 1, 2, 3, 4].map(i => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full',
              i === 1 ? 'bg-cyan-300/60 w-2/3' : 'bg-white/15 w-3/4'
            )}
          />
        ))}
      </div>
      {/* canvas */}
      <div className='p-3 flex flex-col gap-2'>
        <div className='h-2 w-1/3 rounded-full bg-white/30' />
        <div className='h-1.5 w-1/2 rounded-full bg-white/12' />
        <div className='mt-2 grid grid-cols-3 gap-2 flex-1'>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className='rounded-md border border-(--linear-app-shell-border)/70 bg-(--surface-1)/40'
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Class OTP — six independent cells, autoadvance, paste, backspace.
// Owns its own DOM refs so paste anywhere distributes across cells.
function OtpInput({
  value,
  onChange,
  firstRef,
}: {
  value: string;
  onChange: (next: string) => void;
  firstRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setAt(i: number, char: string) {
    const sanitized = char.replace(/[^0-9]/g, '').slice(0, 1);
    const arr = (value + '      ').slice(0, 6).split('');
    arr[i] = sanitized || ' ';
    const next = arr.join('').replace(/ /g, '').slice(0, 6);
    onChange(next);
    if (sanitized && i < 5) {
      refs.current[i + 1]?.focus();
      refs.current[i + 1]?.select();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      e.preventDefault();
      const arr = value.split('');
      arr.splice(i - 1, 1);
      onChange(arr.join(''));
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
      refs.current[i - 1]?.select();
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
      refs.current[i + 1]?.select();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^0-9]/g, '')
      .slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    const last = Math.min(5, pasted.length - 1);
    setTimeout(() => {
      refs.current[last]?.focus();
      refs.current[last]?.select();
    }, 0);
  }

  return (
    <div className='flex items-center gap-2 justify-between'>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input
          key={i}
          ref={el => {
            refs.current[i] = el;
            if (i === 0) firstRef.current = el;
          }}
          type='text'
          inputMode='numeric'
          pattern='[0-9]'
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => setAt(i, e.target.value)}
          onKeyDown={e => onKeyDown(e, i)}
          onPaste={onPaste}
          onFocus={e => e.currentTarget.select()}
          aria-label={`Digit ${i + 1} of 6`}
          className='h-11 w-full min-w-0 rounded-md bg-(--surface-1)/80 border border-(--linear-app-shell-border) text-[18px] tabular-nums font-mono text-center text-primary-token outline-none focus:border-cyan-400/50 transition-colors duration-150 ease-out'
        />
      ))}
    </div>
  );
}

function ContinueButton({
  children,
  submitting,
}: {
  children: React.ReactNode;
  submitting: boolean;
}) {
  return (
    <button
      type='submit'
      disabled={submitting}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-[13px] font-medium bg-white text-black hover:bg-white/90 transition-colors duration-150 ease-out',
        submitting && 'opacity-70'
      )}
    >
      {submitting ? (
        <Loader2 className='h-3.5 w-3.5 animate-spin' strokeWidth={2.5} />
      ) : (
        <>
          {children}
          <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.5} />
        </>
      )}
    </button>
  );
}

function JovieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 353.68 347.97'
      className={className}
      shapeRendering='geometricPrecision'
      aria-hidden='true'
    >
      <path
        fill='currentColor'
        d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z'
      />
    </svg>
  );
}
