import Link from 'next/link';
import {
  MarketingHero,
  MarketingPageShell,
  MarketingSurfaceCard,
} from '@/components/marketing';
import './ProductFeatureLanding.css';

interface ProductFeatureLandingProps {
  /** Route slug; names the heading id and the `${slug}-panel` test id. */
  readonly slug: string;
  /** Repo path of the page component, for the section owner contract. */
  readonly owner: string;
  readonly copy: {
    readonly headline: string;
    readonly support: string;
    readonly links: readonly {
      readonly href: string;
      readonly label: string;
    }[];
  };
  /** The real product component shown in the framed panel. */
  readonly children: React.ReactNode;
}

/**
 * Shared /product/* feature page: a split hero on the single public
 * container. Short headline and one line on the left, the real product
 * component in a rounded glass frame on the right.
 */
export function ProductFeatureLanding({
  slug,
  owner,
  copy,
  children,
}: Readonly<ProductFeatureLandingProps>) {
  const headingId = `${slug}-title`;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <div
        data-accent='ion'
        className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'
      >
        <div
          aria-hidden='true'
          className='marketing-hero-backdrop pointer-events-none absolute inset-0'
        />
        <div
          aria-hidden='true'
          className='hero-glow product-feature-glow pointer-events-none absolute inset-x-0 top-0'
        />
        <MarketingHero
          variant='split'
          headingId={headingId}
          testId='marketing-section-hero'
          sectionVariant='split-screenshot-right'
          sectionOwner={owner}
        >
          <div className='max-w-xl'>
            <h1
              id={headingId}
              data-wrap='editorial-title'
              className='product-feature-title marketing-type-display text-balance text-primary-token'
            >
              {copy.headline}
            </h1>
            <p className='marketing-type-lede mt-6 max-w-xl text-secondary-token'>
              {copy.support}
            </p>
            <div className='mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm'>
              {copy.links.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className='text-secondary-token hover:text-primary-token'
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <MarketingSurfaceCard
            variant='floating'
            glowTone='none'
            testId={`${slug}-panel`}
            className='w-full max-w-xl justify-self-end'
            contentClassName='p-5 sm:p-6'
          >
            {children}
          </MarketingSurfaceCard>
        </MarketingHero>
      </div>
    </MarketingPageShell>
  );
}
