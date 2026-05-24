import Image from 'next/image';
import { Container } from '@/components/site/Container';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

interface FeatureCard {
  readonly heading: string;
  readonly description: string;
  readonly bullets: string[];
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
  readonly glowVariant: 'purple' | 'blue';
}

const FEATURES: FeatureCard[] = [
  {
    heading: 'Release day, automated.',
    description:
      'New music goes live with smart links, fan notifications, and pre-save pages — no setup required.',
    bullets: [
      'Smart links generated automatically for every release',
      'Fans notified via email on release day',
      'Pre-save pages that convert to day-one streams',
    ],
    screenshotSrc: getMarketingExportImage('dashboard-releases-desktop')
      .publicUrl,
    screenshotAlt:
      'Jovie release dashboard showing releases table with smart link details',
    screenshotWidth: 2880,
    screenshotHeight: 1800,
    glowVariant: 'purple',
  },
  {
    heading: 'Know every fan by name.',
    description:
      "Every fan who subscribes, tips, or clicks becomes a contact you own — not a follower trapped on someone else's platform.",
    bullets: [
      'Fan intelligence with source tracking',
      'See which fans came from which release or show',
      'Export contacts anytime — your audience, your data',
    ],
    screenshotSrc: getMarketingExportImage('dashboard-audience-desktop')
      .publicUrl,
    screenshotAlt:
      'Jovie audience CRM showing fan contacts with source tracking',
    screenshotWidth: 2880,
    screenshotHeight: 1800,
    glowVariant: 'blue',
  },
];

function BentoCard({
  card,
  delay,
}: Readonly<{ card: FeatureCard; delay: number }>) {
  return (
    <div
      className='bento-card reveal-on-scroll'
      data-delay={delay > 0 ? String(delay) : undefined}
    >
      {/* Per-card accent glow */}
      <div
        aria-hidden='true'
        className={`bento-card-glow bento-card-glow--${card.glowVariant}`}
      />

      {/* Content */}
      <div className='relative z-10 p-6 pb-0 sm:p-8 sm:pb-0 lg:p-10 lg:pb-0'>
        <h3 className='marketing-h2-linear text-primary-token'>
          {card.heading}
        </h3>
        <p className='marketing-lead-linear mt-3 max-w-[420px] text-secondary-token'>
          {card.description}
        </p>
        <ul className='mt-5 flex flex-col gap-2.5'>
          {card.bullets.map(bullet => (
            <li
              key={bullet}
              className='flex items-start gap-2.5 text-[15px] leading-[1.6] text-secondary-token'
            >
              <span
                aria-hidden='true'
                className='mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full'
                style={{
                  backgroundColor: 'var(--linear-text-tertiary)',
                }}
              />
              {bullet}
            </li>
          ))}
        </ul>
      </div>

      {/* Screenshot — embedded directly, no Mac chrome */}
      <div className='relative z-10 mt-8 overflow-hidden rounded-t-xl sm:mt-10'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
          }}
        />
        <Image
          src={card.screenshotSrc}
          alt={card.screenshotAlt}
          width={card.screenshotWidth}
          height={card.screenshotHeight}
          className='w-full'
          sizes='(min-width: 768px) 50vw, 100vw'
        />
      </div>
    </div>
  );
}

export function FeatureShowcase() {
  return (
    <section className='section-glow section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Section header */}
          <div className='reveal-on-scroll mb-12 max-w-[600px] lg:mb-16'>
            <p className='homepage-section-eyebrow'>The platform</p>
            <h2 className='marketing-h2-linear mt-5 text-primary-token'>
              Everything your music needs.
            </h2>
            <p className='marketing-lead-linear mt-4 text-secondary-token'>
              From smart links to fan intelligence, every release gets the full
              stack.
            </p>
          </div>

          {/* Bento grid */}
          <div className='bento-grid'>
            {FEATURES.map((card, i) => (
              <BentoCard key={card.heading} card={card} delay={i * 80} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
