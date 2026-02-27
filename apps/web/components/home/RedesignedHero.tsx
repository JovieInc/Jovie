import { ClaimHandleForm } from './claim-handle';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[120px] lg:pt-[160px] pb-10'>
      {/* Ambient glow — centered */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background: 'var(--linear-hero-glow)',
          transform: 'translateY(-20%)',
        }}
      />

      <div className='relative flex w-full max-w-[984px] flex-col items-center text-center z-10'>
        <h1
          className='max-w-[900px]'
          style={{
            fontSize: 'clamp(40px, 8vw, 80px)',
            fontWeight: 510,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: 'var(--linear-text-primary)',
            fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
            fontVariationSettings: '"opsz" 64',
          }}
        >
          AI to power your <br className='hidden md:block' />
          music career.
        </h1>

        <p
          className='mx-auto mt-6 max-w-[600px]'
          style={{
            fontSize: 'clamp(18px, 2vw, 21px)',
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: '-0.011em',
            color: 'var(--linear-text-secondary)',
          }}
        >
          Built to amplify your work — not replace it.
        </p>

        <div className='mt-10 w-full max-w-[480px] text-left'>
          <ClaimHandleForm />
        </div>

        <p
          className='mt-4 flex items-center justify-center gap-2'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.01em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-(--linear-success) shadow-[0_0_8px_var(--linear-success)]'
          />{' '}
          Free forever. No credit card.
        </p>

        {/* Product Shot using /demo */}
        <div className='relative w-full max-w-[1100px] mt-20 lg:mt-24'>
          {/* Outer glow/border effect matching Linear */}
          <div className='rounded-2xl lg:rounded-[24px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-2 lg:p-4 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] backdrop-blur-sm'>
            <div className='relative w-full aspect-16/10 overflow-hidden rounded-xl lg:rounded-[18px] border border-(--linear-border-subtle) bg-(--linear-bg-page) shadow-inner'>
              {/* Browser bar mockup */}
              <div className='absolute top-0 left-0 right-0 h-10 lg:h-12 border-b border-(--linear-border-subtle) bg-(--linear-bg-surface-1) flex items-center px-4 gap-2 z-20'>
                <div className='flex gap-1.5'>
                  <div className='w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-(--linear-text-tertiary) opacity-30' />
                  <div className='w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-(--linear-text-tertiary) opacity-30' />
                  <div className='w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-(--linear-text-tertiary) opacity-30' />
                </div>
              </div>

              {/* iframe content */}
              <div className='absolute inset-0 pt-10 lg:pt-12'>
                <iframe
                  src='/demo'
                  className='w-full h-full'
                  title='Product Demo'
                  loading='lazy'
                  style={{ border: 'none', backgroundColor: 'transparent' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
