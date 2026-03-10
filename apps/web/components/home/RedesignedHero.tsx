import { getFeaturedCreators } from '@/lib/featured-creators';
import { ClaimHandleForm } from './claim-handle';
import { HeroPhonePreview } from './HeroPhonePreview';

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

  // First handle drives the phone URL chip
  const featuredHandle = previewHandles[0] ?? 'tim';

  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[8rem] pb-[5rem]'>
      {/* Primary ambient glow */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(20% 0.025 265 / 0.9) 0%, oklch(15% 0.015 260 / 0.4) 50%, transparent 75%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Two-column on desktop: left = text/form, right = phone */}
        <div className='flex flex-col lg:flex-row lg:items-center lg:gap-12 xl:gap-20'>
          {/* Left column — headline, form, chips */}
          <div className='hero-stagger flex flex-col items-center text-center lg:items-start lg:text-left lg:flex-1 max-w-2xl mx-auto lg:mx-0'>
            <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)] mb-5'>
              AI built for artists
            </span>
            <h1 className='marketing-h1-linear text-[var(--linear-text-primary)]'>
              The link your <br className='hidden sm:block' />
              music deserves.
            </h1>

            <p className='mt-5 max-w-[480px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
              Connect your Spotify, capture every fan, and keep marketing your
              music automatically — forever.
            </p>

            <div className='mt-8 w-full max-w-[560px] lg:max-w-full'>
              <ClaimHandleForm size='hero' />
            </div>

            <p
              className='mt-3 flex items-center justify-center lg:justify-start gap-2'
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

          {/* Right column — real Jovie profile phone (desktop only) */}
          <div className='hidden lg:flex lg:shrink-0 lg:items-center lg:justify-center lg:pt-4'>
            <HeroPhonePreview handle={featuredHandle} />
          </div>
        </div>
      </div>
    </section>
  );
}
