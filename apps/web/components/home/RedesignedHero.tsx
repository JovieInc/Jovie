import { getFeaturedCreators } from '@/lib/featured-creators';
import { ClaimHandleForm } from './claim-handle';
import { HeroPhonePreview } from './HeroPhonePreview';

const DEMO_HANDLES = ['tim', 'tiesto', 'x'];
const HERO_PROOF_POINTS = [
  'Grow your email list automatically',
  'Send fans to listen, tip, tour, or follow',
  'Auto-create links for every release',
] as const;

export async function RedesignedHero() {
  let previewHandles: string[] = DEMO_HANDLES;
  try {
    const creators = await getFeaturedCreators();
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

  const featuredHandle = previewHandles[0] ?? 'tim';

  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 pt-[7.25rem] pb-[4rem] sm:px-6 sm:pt-[7.75rem] sm:pb-[4.75rem] lg:pt-[8rem] lg:pb-[5rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(20% 0.025 265 / 0.9) 0%, oklch(15% 0.015 260 / 0.4) 50%, transparent 75%)',
        }}
      />

      <div className='relative z-10 w-full max-w-[var(--linear-content-max)]'>
        <div className='flex flex-col lg:flex-row lg:items-center lg:gap-12 xl:gap-20'>
          <div className='hero-stagger mx-auto flex max-w-2xl flex-col items-center text-center lg:mx-0 lg:max-w-[36rem] lg:flex-1 lg:items-start lg:text-left'>
            <span className='mb-5 inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3.5 py-1.5 text-xs font-medium tracking-[0.01em] text-[color:var(--linear-text-tertiary)] backdrop-blur-sm'>
              Built for artists
            </span>

            <h1 className='marketing-h1-linear max-w-[18rem] text-balance text-[var(--linear-text-primary)] sm:max-w-[28rem] lg:max-w-none'>
              Your entire music career. One intelligent link.
            </h1>

            <p className='marketing-lead-linear mt-4 max-w-[19rem] px-1 text-balance text-[var(--linear-text-secondary)] sm:mt-5 sm:max-w-[31rem] sm:px-0'>
              Import your Spotify, grow your audience automatically, and own
              every fan relationship.
            </p>

            <div className='mt-6 w-full max-w-[35rem] sm:mt-8 lg:max-w-full'>
              <ClaimHandleForm size='hero' />
            </div>

            <div className='mt-5 grid w-full max-w-[35rem] gap-2.5 sm:grid-cols-3 lg:max-w-full'>
              {HERO_PROOF_POINTS.map(point => (
                <div
                  key={point}
                  className='flex items-center gap-2 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-3.5 py-3 text-left text-xs font-medium text-[var(--linear-text-secondary)]'
                >
                  <span
                    aria-hidden='true'
                    className='inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
                  />
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <p
              className='mt-4 flex items-center justify-center gap-2 self-stretch lg:justify-start'
              style={{
                fontSize: '12px',
                fontWeight: 450,
                letterSpacing: '0.01em',
                color: 'rgba(255,255,255,0.58)',
              }}
            >
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
              />{' '}
              Free to start. Your page can be live in 60 seconds.
            </p>
          </div>

          <div className='hidden lg:flex lg:shrink-0 lg:items-center lg:justify-center lg:pt-4 lg:pl-4 xl:pl-8'>
            <HeroPhonePreview handle={featuredHandle} />
          </div>
        </div>
      </div>
    </section>
  );
}
