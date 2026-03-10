import { getFeaturedCreators } from '@/lib/featured-creators';
import { ClaimHandleForm } from './claim-handle';

const DEMO_HANDLES = ['tim', 'tiesto', 'x'];

export async function RedesignedHero() {
  let previewHandles: string[] = DEMO_HANDLES;
  try {
    const creators = await getFeaturedCreators();
    // Only use clean handles (no internal IDs like artist_abc123)
    const cleanHandles = creators
      .map(c => c.handle)
      .filter(h => h && h.length <= 20 && /^[a-z0-9-]+$/.test(h))
      .slice(0, 3);
    if (cleanHandles.length >= 2) {
      previewHandles = cleanHandles;
    }
  } catch {
    // fall back to demo handles
  }

  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[8rem] pb-[5rem]'>
      {/* Primary ambient glow — barely perceptible warmth */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(20% 0.025 265 / 0.9) 0%, oklch(15% 0.015 260 / 0.4) 50%, transparent 75%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Centered text block — Linear layout */}
        <div className='hero-stagger flex flex-col items-center text-center max-w-2xl mx-auto'>
          <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)] mb-5'>
            Built for artists
          </span>
          <h1 className='marketing-h1-linear text-[var(--linear-text-primary)]'>
            The link music <br className='hidden sm:block' />
            deserves.
          </h1>

          <p className='mt-5 max-w-[480px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Connect your Spotify, capture every fan, and keep marketing your
            music automatically — forever.
          </p>

          <div className='mt-8 w-full max-w-[560px]'>
            <ClaimHandleForm size='hero' />
          </div>

          {/* Handle preview chips — pulls from featured creators */}
          <div className='mt-4 flex items-center justify-center gap-x-3 flex-wrap'>
            {previewHandles.map((handle, i) => (
              <span
                key={handle}
                className='flex items-center gap-x-3 text-[12px]'
              >
                {i > 0 && (
                  <span
                    aria-hidden='true'
                    className='text-[var(--linear-text-quaternary)]'
                  >
                    ·
                  </span>
                )}
                <span className='text-[var(--linear-text-tertiary)]'>
                  jov.ie/
                  <span className='font-medium text-[var(--linear-text-secondary)]'>
                    {handle}
                  </span>
                </span>
              </span>
            ))}
          </div>

          <p
            className='mt-3 flex items-center justify-center gap-2'
            style={{
              fontSize: '12px',
              fontWeight: 450,
              letterSpacing: '0.01em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            <span
              aria-hidden='true'
              className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
            />{' '}
            Free to start. Your page can be live in 60 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
