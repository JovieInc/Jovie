import { ClaimHandleForm } from './claim-handle';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 sm:px-6'>
      {/* Ambient glow — centered */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-glow)' }}
      />

      <div className='relative flex w-full max-w-[900px] flex-col items-center py-10 text-center lg:py-14'>
        <h1
          style={{
            fontSize: 'clamp(36px, calc(16px + 4vw), 64px)',
            fontWeight: 510,
            lineHeight: 1,
            letterSpacing: '-0.022em',
            color: 'var(--linear-text-primary)',
            fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
            fontVariationSettings: '"opsz" 64',
          }}
        >
          AI to power your music career.
        </h1>

        <p
          className='mx-auto mt-4 max-w-[500px]'
          style={{
            fontSize: '17px',
            fontWeight: 400,
            lineHeight: 1.6,
            letterSpacing: '-0.011em',
            color: 'var(--linear-text-secondary)',
          }}
        >
          Built to amplify your work — not replace it.
        </p>

        <div className='mt-8 w-full max-w-[480px] text-left'>
          <ClaimHandleForm />
        </div>

        <p
          className='mt-3 flex items-center justify-center gap-2'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.01em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/80'
          />{' '}
          Free forever. No credit card.
        </p>
      </div>
    </section>
  );
}
