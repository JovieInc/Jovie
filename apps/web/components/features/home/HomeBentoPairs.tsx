/**
 * Home — paired bento (frame.io-tight 2-card layout).
 *
 * Source: Claude Design home-page-hero bundle, SectionBento.jsx.
 * Server component, fully static. Replaces BentoFeatureGrid usage on the
 * refreshed home — old grid stays for other consumers until cleaned up.
 *
 * The bundle ships elaborate per-card SVG media (Smart Link, Countdown, Tour,
 * Tip). We ship simpler stylized previews here; richer media graphics can be
 * layered in iteratively without touching the layout contract.
 */

interface BentoCard {
  readonly title: string;
  readonly body: string;
  readonly accent: string;
  readonly preview: React.ReactNode;
}

const PAIRS: ReadonlyArray<readonly [BentoCard, BentoCard]> = [
  [
    {
      title: 'Smart links that stay current',
      body: 'One profile routes fans to the right release on the right streaming destination — automatically.',
      accent: 'var(--geist-purple-solid)',
      preview: <SmartLinkPreview />,
    },
    {
      title: 'Countdowns built in',
      body: 'Upcoming drops turn into pre-save and countdown pages from the same link.',
      accent: 'var(--geist-blue-solid)',
      preview: <CountdownPreview />,
    },
  ],
  [
    {
      title: 'Shows land in the right city',
      body: 'Tour dates lead the page when the next thing that matters is local.',
      accent: 'var(--geist-pink-solid)',
      preview: <TourPreview />,
    },
    {
      title: 'Get paid without losing the moment',
      body: 'Fans can tip in one tap and stay inside the same experience.',
      accent: 'var(--geist-green-solid)',
      preview: <TipPreview />,
    },
  ],
];

export function HomeBentoPairs() {
  return (
    <section
      data-testid='home-bento-pairs-section'
      className='home-bento-pairs-section border-t border-white/[0.06] px-6 py-32 sm:py-36'
    >
      <div className='mx-auto max-w-300'>
        <p className='mb-5 font-(--marketing-font-body) text-sm font-medium text-tertiary-token'>
          What it does
        </p>
        <h2 className='m-0 max-w-[20ch] font-(--marketing-font-display) text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.028em] text-primary-token'>
          <span className='text-tertiary-token'>Turn attention</span>
          <br />
          <span className='text-primary-token'>into action.</span>
        </h2>
        <div className='mt-20 flex flex-col gap-6'>
          {PAIRS.map(pair => (
            <div key={pair[0].title} className='grid gap-6 md:grid-cols-2'>
              {pair.map(card => (
                <BentoCardView key={card.title} card={card} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BentoCardView({ card }: { readonly card: BentoCard }) {
  return (
    <article className='flex flex-col'>
      <div
        className='relative h-80 overflow-hidden'
        style={{ background: 'var(--system-b-bg-surface-0)' }}
      >
        {card.preview}
      </div>
      <div className='px-9 pt-9 pb-10 text-center'>
        <h3 className='m-0 font-(--marketing-font-display) text-xl font-semibold leading-[1.3] tracking-[-0.012em] text-primary-token'>
          {card.title}
        </h3>
        <p className='mx-auto mt-3 max-w-[46ch] font-(--marketing-font-body) text-sm leading-[1.55] text-secondary-token'>
          {card.body}
        </p>
      </div>
    </article>
  );
}

function PreviewHalo({ color }: { readonly color: string }) {
  return (
    <div
      aria-hidden='true'
      className='absolute inset-0'
      style={{
        background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${color} 24%, transparent) 0%, transparent 70%)`,
      }}
    />
  );
}

function SmartLinkPreview() {
  return (
    <div className='absolute inset-0 flex items-center justify-center'>
      <PreviewHalo color='var(--geist-purple-solid)' />
      <div className='relative flex flex-col items-center gap-3 font-(--marketing-font-body)'>
        <div className='flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-surface-1 text-lg font-bold text-primary-token shadow-card'>
          O
        </div>
        <div className='flex gap-2 text-3xs font-medium uppercase tracking-[0.18em] text-tertiary-token'>
          <span>Spotify</span>
          <span aria-hidden='true' className='text-tertiary-token'>
            ·
          </span>
          <span>Apple</span>
          <span aria-hidden='true' className='text-tertiary-token'>
            ·
          </span>
          <span>YT&nbsp;Music</span>
        </div>
      </div>
    </div>
  );
}

function CountdownPreview() {
  return (
    <div className='absolute inset-0 flex items-center justify-center'>
      <PreviewHalo color='var(--geist-blue-solid)' />
      <div
        className='relative font-(--marketing-font-display) text-[64px] font-extrabold leading-none tracking-[-0.04em] text-primary-token tabular-nums'
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        02&nbsp;:&nbsp;14&nbsp;:&nbsp;57
      </div>
    </div>
  );
}

function TourPreview() {
  const cities = [
    { city: 'Brooklyn, NY', date: 'Mar 14' },
    { city: 'Austin, TX', date: 'Mar 22' },
    { city: 'Los Angeles, CA', date: 'Apr 02' },
  ];
  return (
    <div className='absolute inset-0 flex items-center justify-center px-8'>
      <PreviewHalo color='var(--geist-pink-solid)' />
      <ul className='relative w-full max-w-70 space-y-2'>
        {cities.map(c => (
          <li
            key={c.city}
            className='flex items-center justify-between px-3 py-2 font-(--marketing-font-body) text-xs text-primary-token'
          >
            <span>{c.city}</span>
            <span className='text-tertiary-token'>{c.date}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipPreview() {
  return (
    <div className='absolute inset-0 flex items-center justify-center'>
      <PreviewHalo color='var(--geist-green-solid)' />
      <div className='relative flex items-baseline gap-1 font-(--marketing-font-display) text-primary-token'>
        <span
          className='text-3xl font-semibold'
          style={{ color: 'var(--geist-green-solid)' }}
        >
          $
        </span>
        <span className='text-[64px] font-bold leading-none tracking-[-0.04em] tabular-nums'>
          12
        </span>
      </div>
    </div>
  );
}
