'use client';

// ---------------------------------------------------------------------------
// Home V1 — variant playground for the marketing hero.
//
// Four wildly different hero designs share the same content (composer +
// quick-reply chips). Below the fold: logo strip · artist carousel ·
// outcomes · final CTA · footer.
// Hero takes the full viewport; scroll reveals everything else.
//
// Variants:
//   A · Product Shell      — lovable-style: composer IS the page
//   B · Conversation Hero  — already mid-conversation with Jovie
//   C · Brutalist Editorial— cream, asymmetric grid, uppercase
//   D · Cinematic Poster   — huge type, ambient halo, single CTA
// ---------------------------------------------------------------------------

import { ArrowDown, ArrowRight, ArrowUp, Mic, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  TheOrchardLogo,
} from '@/components/features/home/label-logos';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

const SUGGESTIONS = [
  'Plan a release',
  'Generate album art',
  'Pitch playlists',
  'Build a profile',
  'Analyze momentum',
];

const HEADLINE = 'Release more music with less work.';
const SUBHEAD =
  'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.';
const EYEBROW = 'Built for artists';

type Variant = 'a' | 'b' | 'c' | 'd';
const VARIANTS: ReadonlyArray<{ id: Variant; label: string; tone: string }> = [
  { id: 'a', label: 'Product Shell', tone: 'A' },
  { id: 'b', label: 'Conversation', tone: 'B' },
  { id: 'c', label: 'Brutalist', tone: 'C' },
  { id: 'd', label: 'Cinematic', tone: 'D' },
];

// Static featured creators for the experimental page. Mirrors the shape
// of FeaturedCreator (id, handle, name, src, alt) but uses seeded image
// URLs so the route doesn't need DB access.
const FEATURED_CREATORS = [
  { id: 'c1', handle: 'bahamas', name: 'Bahamas', seed: 'jovie-art-a' },
  { id: 'c2', handle: 'sade', name: 'Sade', seed: 'jovie-art-b' },
  { id: 'c3', handle: 'frankocean', name: 'Frank Ocean', seed: 'jovie-art-c' },
  { id: 'c4', handle: 'tycho', name: 'Tycho', seed: 'jovie-art-d' },
  { id: 'c5', handle: 'bonobo', name: 'Bonobo', seed: 'jovie-art-e' },
  { id: 'c6', handle: 'khruangbin', name: 'Khruangbin', seed: 'jovie-art-f' },
  {
    id: 'c7',
    handle: 'badbadnotgood',
    name: 'BADBADNOTGOOD',
    seed: 'jovie-art-g',
  },
  {
    id: 'c8',
    handle: 'andersonpaak',
    name: 'Anderson .Paak',
    seed: 'jovie-art-h',
  },
  {
    id: 'c9',
    handle: 'ericagibson',
    name: 'Erica Gibson',
    seed: 'jovie-art-i',
  },
  { id: 'c10', handle: 'timwhite', name: 'Tim White', seed: 'jovie-art-j' },
  { id: 'c11', handle: 'caribou', name: 'Caribou', seed: 'jovie-art-k' },
  { id: 'c12', handle: 'fourtet', name: 'Four Tet', seed: 'jovie-art-l' },
] as const;

export default function HomeV1Page() {
  const [variant, setVariant] = useState<Variant>('a');
  const [draft, setDraft] = useState('');
  const logoRef = useRef<HTMLDivElement | null>(null);

  function submit() {
    if (!draft.trim() && variant !== 'd') return;
    window.location.href = '/exp/auth-v1';
  }

  function scrollToLogos() {
    logoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Persist variant in URL hash so reload survives & links are shareable.
  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '') as Variant | '';
    if (fromHash && VARIANTS.some(v => v.id === fromHash)) setVariant(fromHash);
  }, []);
  useEffect(() => {
    if (window.location.hash !== `#${variant}`) {
      window.history.replaceState(null, '', `#${variant}`);
    }
  }, [variant]);

  const heroProps = {
    draft,
    onDraft: setDraft,
    onSubmit: submit,
    onScrollNext: scrollToLogos,
  };

  return (
    <div
      className={cn(
        'home-v1 min-h-dvh w-full',
        variant === 'c'
          ? 'bg-[#F5F3EE] text-[#0a0a0a]'
          : 'bg-[#06070a] text-white'
      )}
      style={{
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      }}
    >
      <style>{`
        .home-v1 :focus { outline: none; }
        .home-v1 :focus-visible {
          outline: none;
          box-shadow:
            0 0 0 1px rgba(103, 232, 249, 0.18),
            0 0 0 6px rgba(103, 232, 249, 0.08);
        }
        @keyframes hv1-bubble-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hv1-halo-drift {
          0%   { transform: translate3d(-2%, -1%, 0) scale(1); opacity: 0.78; }
          50%  { transform: translate3d(3%, 2%, 0) scale(1.08); opacity: 1; }
          100% { transform: translate3d(-2%, -1%, 0) scale(1); opacity: 0.78; }
        }
        @keyframes hv1-typing {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 0.95; }
        }
      `}</style>

      <VariantToggle variant={variant} onChange={setVariant} />

      <Nav variant={variant} />

      {variant === 'a' && <HeroProductShell {...heroProps} />}
      {variant === 'b' && <HeroConversation {...heroProps} />}
      {variant === 'c' && <HeroBrutalist {...heroProps} />}
      {variant === 'd' && <HeroCinematic {...heroProps} />}

      <div ref={logoRef} />
      <Trust variant={variant} />
      <ArtistsBuilt variant={variant} />
      <Outcomes variant={variant} />
      <FinalCta variant={variant} />
      <Footer variant={variant} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant toggle — fixed at top right; small, calm, only visible on hover.
// ---------------------------------------------------------------------------
function VariantToggle({
  variant,
  onChange,
}: {
  variant: Variant;
  onChange: (v: Variant) => void;
}) {
  return (
    <div className='fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md border border-white/12 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.5)]'>
      {VARIANTS.map(v => (
        <button
          key={v.id}
          type='button'
          onClick={() => onChange(v.id)}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11.5px] font-medium tracking-[-0.005em] transition-all duration-150 ease-out',
            variant === v.id
              ? 'bg-white text-black'
              : 'text-white/55 hover:text-white hover:bg-white/8'
          )}
          title={`Variant ${v.tone}: ${v.label}`}
        >
          <span className='font-mono text-[10px] opacity-60'>{v.tone}</span>
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav — adapts to variant theme (cream-on-dark in C, white-on-dark elsewhere).
// ---------------------------------------------------------------------------
function Nav({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  return (
    <nav
      className={cn(
        'absolute top-0 left-0 right-0 z-30 max-w-[1200px] mx-auto flex items-center justify-between h-16 px-6 lg:px-10',
        onCream ? 'text-[#0a0a0a]' : 'text-white'
      )}
    >
      <div className='flex items-center gap-2.5'>
        <JovieMark
          className={cn('h-5 w-5', onCream ? 'text-[#0a0a0a]' : 'text-white')}
        />
        <span className='text-[15px] font-semibold tracking-[-0.018em]'>
          Jovie
        </span>
      </div>
      <div className='flex items-center gap-2'>
        <Link
          href='/exp/auth-v1'
          className={cn(
            'inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] transition-colors duration-150 ease-out',
            onCream
              ? 'text-[#0a0a0a]/55 hover:text-[#0a0a0a]'
              : 'text-white/55 hover:text-white'
          )}
        >
          Sign in
        </Link>
        <Link
          href='/exp/auth-v1'
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12.5px] font-medium transition-all duration-150 ease-out',
            onCream
              ? 'bg-[#0a0a0a] text-[#F5F3EE] hover:brightness-110'
              : 'bg-white text-black hover:brightness-110 active:scale-[0.99] shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45)]'
          )}
        >
          Get started
          <ArrowRight className='h-3 w-3' strokeWidth={2.5} />
        </Link>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// VARIANT A · Product Shell — lovable.dev pattern. The composer IS the
// page. No headline, no subhead, no hard sell. Faint shell hints (top
// rule, sidebar edge, subtle audio bar) tell you "you're in the app."
// ---------------------------------------------------------------------------
function HeroProductShell({
  draft,
  onDraft,
  onSubmit,
  onScrollNext,
}: HeroProps) {
  return (
    <section className='relative h-dvh flex flex-col items-center justify-center px-6 lg:px-8 overflow-hidden'>
      {/* Faint sidebar hint on left edge — suggests "in the app shell"
          without rendering the full sidebar. Linear-style chrome. */}
      <div
        aria-hidden='true'
        className='hidden lg:block absolute top-0 bottom-0 left-0 w-[212px] border-r border-white/[0.04]'
        style={{
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.012) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      {/* Faint top rule — suggests app header. */}
      <div
        aria-hidden='true'
        className='absolute top-16 left-0 right-0 h-px bg-white/[0.04]'
      />
      {/* Faint audio bar hint at bottom — three small mock pills. */}
      <div
        aria-hidden='true'
        className='hidden lg:flex absolute bottom-0 left-0 right-0 h-12 items-center px-6 border-t border-white/[0.04] gap-3'
      >
        <span className='h-7 w-7 rounded-md bg-white/[0.04]' />
        <div className='flex flex-col gap-1'>
          <span className='block h-1.5 w-24 rounded-full bg-white/[0.06]' />
          <span className='block h-1.5 w-16 rounded-full bg-white/[0.04]' />
        </div>
        <div className='ml-auto flex items-center gap-3'>
          <span className='h-1.5 w-6 rounded-full bg-white/[0.05]' />
          <span className='h-1.5 w-12 rounded-full bg-white/[0.04]' />
          <span className='h-1.5 w-6 rounded-full bg-white/[0.05]' />
        </div>
      </div>

      <div className='relative z-[2] w-full max-w-[680px] flex flex-col items-center text-center'>
        <span className='inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[10.5px] uppercase tracking-[0.14em] font-medium text-cyan-300/85 bg-cyan-500/[0.08] border border-cyan-500/15 mb-7'>
          <Sparkles className='h-3 w-3' strokeWidth={2.25} />
          Ask Jovie anything
        </span>

        <ProductComposer draft={draft} onDraft={onDraft} onSubmit={onSubmit} />

        <div className='mt-4 flex flex-wrap justify-center gap-1.5'>
          {SUGGESTIONS.map(label => (
            <button
              key={label}
              type='button'
              onClick={() => onDraft(label)}
              className='inline-flex items-center h-7 px-3 rounded-full text-[11.5px] text-white/55 bg-white/[0.03] border border-white/[0.06] hover:text-white hover:bg-white/[0.07] transition-colors duration-150 ease-out'
            >
              {label}
            </button>
          ))}
        </div>

        <p className='mt-10 text-[11.5px] text-white/30'>
          Free during beta · No credit card · Cancel anytime
        </p>
      </div>

      <ScrollCue onClick={onScrollNext} />
    </section>
  );
}

// Larger, more dominant composer for the product-shell hero. Same DNA
// as the in-app composer but scaled up for marketing prominence.
function ProductComposer({
  draft,
  onDraft,
  onSubmit,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit();
      }}
      className='w-full'
    >
      <div
        className='relative flex items-center h-14 pl-5 pr-2 rounded-2xl bg-white/[0.04] border border-white/[0.10] focus-within:border-cyan-300/45 focus-within:bg-white/[0.06] transition-all duration-200 ease-out'
        style={{
          boxShadow:
            '0 16px 48px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <input
          type='text'
          value={draft}
          onChange={e => onDraft(e.target.value)}
          placeholder='Plan a release. Generate album art. Pitch playlists. Anything.'
          aria-label='Tell Jovie what you need'
          className='flex-1 bg-transparent text-[15px] text-white placeholder:text-white/35 outline-none'
        />
        <button
          type='button'
          aria-label='Push-to-talk'
          className='shrink-0 h-9 w-9 grid place-items-center rounded-full text-white/45 hover:text-white hover:bg-white/[0.07] transition-colors duration-150 ease-out'
        >
          <Mic className='h-4 w-4' strokeWidth={2.25} />
        </button>
        <button
          type='submit'
          aria-label='Continue'
          disabled={!draft.trim()}
          className={cn(
            'shrink-0 ml-1 h-10 w-10 grid place-items-center rounded-xl bg-white text-black transition-all duration-150 ease-out',
            draft.trim()
              ? 'opacity-100 hover:brightness-110 active:scale-95 shadow-[0_4px_14px_rgba(255,255,255,0.18)]'
              : 'opacity-40 cursor-not-allowed'
          )}
        >
          <ArrowUp className='h-4 w-4' strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// VARIANT B · Conversation Hero — looks like an active Jovie chat.
// Real bubbles, typing indicator, composer pinned at the bottom of viewport.
// ---------------------------------------------------------------------------
function HeroConversation({
  draft,
  onDraft,
  onSubmit,
  onScrollNext,
}: HeroProps) {
  return (
    <section className='relative h-dvh flex flex-col px-6 lg:px-8'>
      {/* Eyebrow + headline up top */}
      <div className='mx-auto w-full max-w-[640px] pt-[88px] lg:pt-[110px] flex flex-col items-center text-center'>
        <span className='text-[10.5px] uppercase tracking-[0.14em] font-bold text-white/22 mb-4'>
          {EYEBROW}
        </span>
        <h1
          className='text-[34px] lg:text-[42px] font-semibold leading-[1.06] text-white max-w-[18ch]'
          style={{ letterSpacing: '-0.024em' }}
        >
          {HEADLINE}
        </h1>
      </div>

      {/* Conversation occupies the middle */}
      <div className='flex-1 min-h-0 flex flex-col justify-end'>
        <div className='mx-auto w-full max-w-[600px] space-y-3 pb-6'>
          <ChatBubble delay={120}>
            Hey. I&apos;m Jovie — I&apos;ll help you set up your home and figure
            out the best way to grow this quarter.
          </ChatBubble>
          <ChatBubble delay={420}>
            What&apos;s working for you right now? What would you ship if you
            had a week of clear runway?
          </ChatBubble>
          <TypingDots delay={760} />
        </div>
      </div>

      {/* Composer + chips */}
      <div className='mx-auto w-full max-w-[600px] pb-[120px]'>
        <Composer draft={draft} onDraft={onDraft} onSubmit={onSubmit} />
        <div className='mt-3 flex flex-wrap justify-center gap-1.5'>
          {SUGGESTIONS.map(label => (
            <button
              key={label}
              type='button'
              onClick={() => onDraft(label)}
              className='inline-flex items-center h-7 px-3 rounded-full text-[11.5px] text-white/52 bg-white/[0.04] border border-white/8 hover:text-white hover:bg-white/8 transition-colors duration-150 ease-out'
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ScrollCue onClick={onScrollNext} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// VARIANT C · Brutalist Editorial — cream background, asymmetric grid,
// uppercase, thick black borders, no rounded corners on chrome.
// ---------------------------------------------------------------------------
function HeroBrutalist({ draft, onDraft, onSubmit, onScrollNext }: HeroProps) {
  return (
    <section className='relative h-dvh flex flex-col px-6 lg:px-10 pt-[88px] lg:pt-[110px] pb-10'>
      <div className='flex-1 min-h-0 grid grid-cols-12 gap-6 lg:gap-10 max-w-[1200px] w-full mx-auto'>
        {/* Left rail: eyebrow + tiny meta */}
        <div className='col-span-12 lg:col-span-3 flex flex-col gap-3'>
          <div className='border-2 border-[#0a0a0a] px-3 py-2 inline-block w-fit'>
            <span className='text-[10px] uppercase tracking-[0.18em] font-extrabold'>
              {EYEBROW}
            </span>
          </div>
          <p className='text-[12px] uppercase tracking-[0.06em] text-[#0a0a0a]/55 leading-[1.5] max-w-[26ch]'>
            ED. 01 / 2026 — A studio for artists who&apos;d rather make than
            manage.
          </p>
        </div>

        {/* Center: massive stacked headline */}
        <div className='col-span-12 lg:col-span-9 flex flex-col justify-center'>
          <h1
            className='text-[58px] lg:text-[112px] font-black leading-[0.92] uppercase'
            style={{
              letterSpacing: '-0.04em',
              fontFeatureSettings: '"ss01"',
            }}
          >
            Release
            <br />
            more music
            <br />
            with less work.
          </h1>
          <p className='mt-6 text-[14px] lg:text-[15.5px] leading-[1.55] text-[#0a0a0a]/72 max-w-[50ch]'>
            {SUBHEAD}
          </p>

          {/* Composer — sharp corners, black-on-cream */}
          <form
            onSubmit={e => {
              e.preventDefault();
              onSubmit();
            }}
            className='mt-8 flex items-center gap-0 max-w-[640px] border-2 border-[#0a0a0a]'
          >
            <input
              type='text'
              value={draft}
              onChange={e => onDraft(e.target.value)}
              placeholder='ASK JOVIE…'
              className='flex-1 h-12 px-4 bg-transparent text-[13.5px] uppercase tracking-[0.04em] placeholder:text-[#0a0a0a]/35 outline-none'
            />
            <button
              type='submit'
              disabled={!draft.trim()}
              className={cn(
                'h-12 px-5 text-[12px] uppercase tracking-[0.14em] font-bold border-l-2 border-[#0a0a0a] transition-colors duration-150 ease-out',
                draft.trim()
                  ? 'bg-[#0a0a0a] text-[#F5F3EE] hover:brightness-110'
                  : 'bg-transparent text-[#0a0a0a]/50 cursor-not-allowed'
              )}
            >
              Send
            </button>
          </form>

          {/* Chips — square, bordered, uppercase */}
          <div className='mt-5 flex flex-wrap gap-0 max-w-[640px]'>
            {SUGGESTIONS.map((label, i) => (
              <button
                key={label}
                type='button'
                onClick={() => onDraft(label)}
                className={cn(
                  'inline-flex items-center h-9 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold border-2 border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#F5F3EE] transition-colors duration-150 ease-out',
                  i > 0 && 'border-l-0'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScrollCue onClick={onScrollNext} tone='dark' />
    </section>
  );
}

// ---------------------------------------------------------------------------
// VARIANT D · Cinematic Poster — huge type, ambient halo, single CTA.
// ---------------------------------------------------------------------------
function HeroCinematic({ onScrollNext }: HeroProps) {
  return (
    <section className='relative h-dvh flex items-center justify-center px-6 lg:px-8 overflow-hidden'>
      {/* Halo */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(58% 50% at 50% 50%, rgba(120, 96, 255, 0.32) 0%, rgba(64, 200, 255, 0.16) 28%, rgba(8,9,13,0) 70%)',
          animation: `hv1-halo-drift 22s ${EASE_CINEMATIC} infinite`,
        }}
      />
      {/* Subtle grain to keep gradients from banding */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay'
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className='relative z-10 max-w-[920px] flex flex-col items-center text-center'>
        <span className='text-[11px] uppercase tracking-[0.22em] font-medium text-white/45 mb-7'>
          {EYEBROW}
        </span>
        <h1
          className='text-[60px] sm:text-[88px] lg:text-[116px] font-bold leading-[0.96] text-white'
          style={{
            letterSpacing: '-0.038em',
            textWrap: 'balance' as React.CSSProperties['textWrap'],
          }}
        >
          {HEADLINE}
        </h1>
        <p className='mt-7 text-[16px] lg:text-[18px] leading-[1.5] text-white/60 max-w-[52ch]'>
          {SUBHEAD}
        </p>
        <Link
          href='/exp/auth-v1'
          className='mt-10 inline-flex items-center gap-2 h-12 pl-6 pr-5 rounded-full bg-white text-black text-[13.5px] font-medium hover:brightness-110 active:scale-[0.99] shadow-[0_10px_36px_rgba(120,96,255,0.32),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-150 ease-out'
        >
          Start free
          <ArrowRight className='h-4 w-4' strokeWidth={2.4} />
        </Link>
        <div className='mt-8 flex flex-wrap justify-center gap-1.5 max-w-[560px]'>
          {SUGGESTIONS.map(label => (
            <span
              key={label}
              className='inline-flex items-center h-7 px-3 rounded-full text-[11.5px] text-white/40 bg-white/[0.03] border border-white/[0.06]'
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <ScrollCue onClick={onScrollNext} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared composer (used by A, B). Rounded-full, mic + send, focus ring.
// ---------------------------------------------------------------------------
function Composer({
  draft,
  onDraft,
  onSubmit,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit();
      }}
      className='mt-9 w-full'
    >
      <div className='relative flex items-center h-12 pl-5 pr-2 rounded-full bg-white/[0.04] border border-white/10 focus-within:border-cyan-300/45 focus-within:bg-white/[0.06] transition-colors duration-150 ease-out'>
        <input
          type='text'
          value={draft}
          onChange={e => onDraft(e.target.value)}
          placeholder='Ask Jovie…'
          aria-label='Tell Jovie what you need'
          className='flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 outline-none'
        />
        <button
          type='button'
          aria-label='Push-to-talk'
          className='shrink-0 h-8 w-8 grid place-items-center rounded-full text-white/45 hover:text-white hover:bg-white/8 transition-colors duration-150 ease-out'
        >
          <Mic className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
        <button
          type='submit'
          aria-label='Continue'
          disabled={!draft.trim()}
          className={cn(
            'shrink-0 ml-1 h-8 w-8 grid place-items-center rounded-full bg-white text-black transition-all duration-150 ease-out',
            draft.trim()
              ? 'opacity-100 hover:brightness-110 active:scale-95'
              : 'opacity-40 cursor-not-allowed'
          )}
        >
          <ArrowUp className='h-3.5 w-3.5' strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );
}

function ChatBubble({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className='flex items-start gap-2.5 opacity-0'
      style={{
        animation: `hv1-bubble-in 320ms ${EASE_CINEMATIC} ${delay}ms forwards`,
      }}
    >
      <span className='shrink-0 h-6 w-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 grid place-items-center mt-1'>
        <JovieMark className='h-3 w-3 text-cyan-400' />
      </span>
      <div className='text-[14px] leading-[1.55] text-white/80 max-w-[440px]'>
        {children}
      </div>
    </div>
  );
}

function TypingDots({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className='flex items-start gap-2.5 opacity-0'
      style={{
        animation: `hv1-bubble-in 320ms ${EASE_CINEMATIC} ${delay}ms forwards`,
      }}
    >
      <span className='shrink-0 h-6 w-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 grid place-items-center mt-1'>
        <JovieMark className='h-3 w-3 text-cyan-400' />
      </span>
      <div className='flex items-center gap-1 h-6 mt-1'>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className='h-1.5 w-1.5 rounded-full bg-white/45'
            style={{
              animation: `hv1-typing 1.2s ease-in-out ${i * 160}ms infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ScrollCue({
  onClick,
  tone = 'light',
}: {
  onClick: () => void;
  tone?: 'light' | 'dark';
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label='Scroll to next section'
      className={cn(
        'absolute bottom-7 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 h-8 px-3 rounded-full text-[11px] uppercase tracking-[0.14em] font-medium transition-colors duration-150 ease-out',
        tone === 'dark'
          ? 'text-[#0a0a0a]/45 hover:text-[#0a0a0a] hover:bg-[#0a0a0a]/5'
          : 'text-white/35 hover:text-white hover:bg-white/8'
      )}
    >
      Scroll
      <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Trust strip — adapts to variant tone.
// ---------------------------------------------------------------------------
function Trust({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  return (
    <section
      className={cn(
        'px-6 lg:px-8 pt-16 pb-16',
        onCream
          ? 'border-t border-[#0a0a0a]/12'
          : 'border-t border-white/[0.06]'
      )}
    >
      <div className='max-w-[1200px] mx-auto'>
        <p
          className={cn(
            'text-center text-[10.5px] uppercase tracking-[0.14em] font-bold mb-7',
            onCream ? 'text-[#0a0a0a]/35' : 'text-white/22'
          )}
        >
          Trusted by artists on
        </p>
        <div
          className={cn(
            'flex items-center justify-center gap-x-12 lg:gap-x-16',
            onCream ? 'text-[#0a0a0a]/72' : 'text-white/55'
          )}
        >
          <AwalLogo className='h-[22px] w-auto select-none' />
          <TheOrchardLogo className='h-[30px] w-auto select-none' />
          <ArmadaMusicLogo className='h-[24px] w-auto select-none' />
          <BlackHoleRecordingsLogo className='h-[18px] w-auto select-none' />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Built for artists — horizontal carousel of creator avatars.
// Mirrors the homepage FeaturedArtistsDriftRow vibe (circle avatars,
// horizontal scroll, edge fades) but with static seeded data so the
// experimental route doesn't need DB access.
// ---------------------------------------------------------------------------
function ArtistsBuilt({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Subtle parallax drift: row shifts slightly left as section enters
  // viewport, mirroring the production FeaturedArtistsDriftRow feel.
  useEffect(() => {
    function update() {
      const el = containerRef.current;
      const row = rowRef.current;
      if (!el || !row) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = vh + rect.height;
      if (denom <= 0) return;
      const progress = Math.max(0, Math.min(1, (vh - rect.top) / denom));
      row.style.transform = `translate3d(${-Math.round(progress * 56)}px, 0, 0)`;
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <section
      className={cn('px-0 pt-2 pb-20', onCream ? '' : '')}
      ref={containerRef}
    >
      <div className='max-w-[1200px] mx-auto px-6 lg:px-8 mb-8'>
        <p
          className={cn(
            'text-center text-[10.5px] uppercase tracking-[0.14em] font-bold',
            onCream ? 'text-[#0a0a0a]/35' : 'text-white/22'
          )}
        >
          Built for artists
        </p>
      </div>
      <div className='relative w-full overflow-hidden'>
        <div className='w-full overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <div
            ref={rowRef}
            className='flex flex-nowrap items-center justify-start gap-8 sm:gap-10 px-6 lg:px-12 py-2 w-max will-change-transform'
          >
            {FEATURED_CREATORS.map(creator => (
              <Link
                key={creator.id}
                href={`/${creator.handle}`}
                aria-label={`View ${creator.name}'s profile`}
                title={creator.name}
                className='group flex flex-col items-center'
              >
                <div
                  className={cn(
                    'relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-2 transition-colors duration-200 ease-out',
                    onCream
                      ? 'border-[#0a0a0a]/12 group-hover:border-[#0a0a0a]/40'
                      : 'border-white/[0.08] group-hover:border-white/35'
                  )}
                >
                  <Image
                    src={`https://picsum.photos/seed/${creator.seed}/256/256`}
                    alt={creator.name}
                    fill
                    sizes='(max-width: 640px) 96px, (max-width: 768px) 112px, 128px'
                    loading='lazy'
                    className='object-cover'
                    unoptimized
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-14',
            onCream
              ? 'bg-gradient-to-r from-[#F5F3EE] to-transparent'
              : 'bg-gradient-to-r from-[#06070a] to-transparent'
          )}
        />
        <div
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-14',
            onCream
              ? 'bg-gradient-to-l from-[#F5F3EE] to-transparent'
              : 'bg-gradient-to-l from-[#06070a] to-transparent'
          )}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Outcomes — three cards.
// ---------------------------------------------------------------------------
function Outcomes({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  const items = [
    {
      eyebrow: 'Releases',
      title: 'A studio that ships for you.',
      body: 'Schedule drops, brief assets, and run pitch lists from one workspace. Jovie keeps the queue moving while you make the music.',
    },
    {
      eyebrow: 'Audience',
      title: 'See where to play next.',
      body: 'Geo-trends, growth signals, and booking openings surfaced as one action at a time — no dashboards to read.',
    },
    {
      eyebrow: 'Assets',
      title: 'Canvas, lyric clips, reels.',
      body: 'Every format you need to ship a release — generated to your taste, in your voice. Approve, schedule, done.',
    },
  ];
  return (
    <section className='px-6 lg:px-8 pb-24'>
      <div className='max-w-[1200px] mx-auto grid gap-6 lg:grid-cols-3'>
        {items.map(it => (
          <div
            key={it.title}
            className={cn(
              'px-7 py-7',
              onCream
                ? 'border-2 border-[#0a0a0a] bg-transparent'
                : 'rounded-[18px] border border-white/[0.06] bg-white/[0.02]'
            )}
            style={
              onCream
                ? undefined
                : {
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -16px rgba(0,0,0,0.4)',
                  }
            }
          >
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.14em] font-bold',
                onCream ? 'text-[#0a0a0a]/45' : 'text-white/22'
              )}
            >
              {it.eyebrow}
            </span>
            <h3
              className={cn(
                'mt-2 text-[18px] font-semibold leading-tight',
                onCream ? 'text-[#0a0a0a]' : 'text-white'
              )}
              style={{ letterSpacing: '-0.022em' }}
            >
              {it.title}
            </h3>
            <p
              className={cn(
                'mt-2 text-[12.5px] leading-[1.6]',
                onCream ? 'text-[#0a0a0a]/68' : 'text-white/55'
              )}
            >
              {it.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  return (
    <section className='px-6 lg:px-8 pb-24'>
      <div className='max-w-[1200px] mx-auto text-center'>
        <span
          className={cn(
            'text-[10.5px] uppercase tracking-[0.14em] font-bold',
            onCream ? 'text-[#0a0a0a]/45' : 'text-white/22'
          )}
        >
          Free during beta
        </span>
        <h2
          className={cn(
            'mt-3 text-[28px] lg:text-[34px] font-semibold leading-tight max-w-[20ch] mx-auto',
            onCream ? 'text-[#0a0a0a]' : 'text-white'
          )}
          style={{ letterSpacing: '-0.022em' }}
        >
          Spend less time managing. More time creating.
        </h2>
        <div className='mt-8 inline-flex items-center gap-2'>
          <Link
            href='/exp/auth-v1'
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-[13px] font-medium transition-all duration-150 ease-out',
              onCream
                ? 'bg-[#0a0a0a] text-[#F5F3EE] hover:brightness-110'
                : 'bg-white text-black hover:brightness-110 active:scale-[0.99] shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45)]'
            )}
          >
            Get started
            <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.5} />
          </Link>
          <Link
            href='/exp/auth-v1'
            className={cn(
              'inline-flex items-center h-10 px-5 rounded-full text-[13px] transition-colors duration-150 ease-out',
              onCream
                ? 'border-2 border-[#0a0a0a] text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#F5F3EE]'
                : 'text-white/72 border border-white/10 hover:text-white hover:bg-white/[0.04]'
            )}
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer({ variant }: { variant: Variant }) {
  const onCream = variant === 'c';
  return (
    <footer
      className={cn(
        'border-t px-6 lg:px-8',
        onCream ? 'border-[#0a0a0a]/12' : 'border-white/[0.06]'
      )}
    >
      <div
        className={cn(
          'max-w-[1200px] mx-auto flex items-center justify-between h-14 text-[11.5px]',
          onCream ? 'text-[#0a0a0a]/45' : 'text-white/35'
        )}
      >
        <div className='flex items-center gap-2'>
          <JovieMark className='h-3.5 w-3.5 opacity-50' />
          <span>© 2026 Jovie</span>
        </div>
        <div className='flex items-center gap-5'>
          <Link
            href='/terms'
            className={cn(
              'transition-colors duration-150 ease-out',
              onCream ? 'hover:text-[#0a0a0a]' : 'hover:text-white/72'
            )}
          >
            Terms
          </Link>
          <Link
            href='/privacy'
            className={cn(
              'transition-colors duration-150 ease-out',
              onCream ? 'hover:text-[#0a0a0a]' : 'hover:text-white/72'
            )}
          >
            Privacy
          </Link>
          <Link
            href='/'
            className={cn(
              'transition-colors duration-150 ease-out',
              onCream ? 'hover:text-[#0a0a0a]' : 'hover:text-white/72'
            )}
          >
            Home (live)
          </Link>
        </div>
      </div>
    </footer>
  );
}

type HeroProps = {
  readonly draft: string;
  readonly onDraft: (v: string) => void;
  readonly onSubmit: () => void;
  readonly onScrollNext: () => void;
};

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
