// @coverage-via apps/web/components/homepage/shell-hero/HomepageWhatsNew.test.tsx
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import {
  type CustomerChangelogEntry,
  customerChangelogEntryPath,
  formatCustomerChangelogDate,
  groupCustomerChangelogByMonth,
  projectCustomerChangelogArchive,
} from '@/lib/customer-changelog';

export type WhatsNewEntry = Pick<
  CustomerChangelogEntry,
  'id' | 'title' | 'date'
>;

/** The latest three customer changelog entries, from the /changelog source. */
export async function latestWhatsNewEntries(): Promise<
  readonly CustomerChangelogEntry[]
> {
  const snapshot = await getChangelogSnapshot();
  const projection = projectCustomerChangelogArchive(snapshot.sourceReleases);
  return groupCustomerChangelogByMonth(projection.entries)
    .flatMap(group => group.entries)
    .slice(0, 3);
}

/**
 * Canonical What's-new preview: three real product updates, the same
 * entries /changelog leads with. Renders nothing when none are published, so
 * the page never shows a placeholder.
 */
export async function HomepageWhatsNew() {
  return <HomepageWhatsNewSection entries={await latestWhatsNewEntries()} />;
}

export function HomepageWhatsNewSection({
  entries,
  copy = HOMEPAGE_COPY.shell.whatsNew,
}: Readonly<{
  entries: readonly CustomerChangelogEntry[];
  copy?: HomepageCopy['shell']['whatsNew'];
}>) {
  if (entries.length === 0) return null;

  return (
    <section
      className='shell-section'
      aria-labelledby='home-whats-new-heading'
      data-accent='ion'
      data-testid='marketing-section-product-gallery'
      data-marketing-owner='apps/web/components/homepage/shell-hero/HomepageWhatsNew.tsx'
      data-marketing-variant='release-rail'
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.productGallery}
    >
      <MarketingContainer width='page'>
        <h2
          id='home-whats-new-heading'
          className='marketing-type-section text-balance text-primary-token'
        >
          {copy.heading}
        </h2>
        <ol className='shell-whats-new__list'>
          {entries.map(entry => (
            <li key={entry.id}>
              <Link
                href={customerChangelogEntryPath(entry)}
                className='shell-whats-new__link focus-ring-themed'
              >
                <span className='shell-whats-new__date'>
                  {formatCustomerChangelogDate(entry.date)}
                </span>
                <span className='shell-whats-new__title'>{entry.title}</span>
              </Link>
            </li>
          ))}
        </ol>
        <Link
          href={APP_ROUTES.CHANGELOG}
          className='shell-whats-new__all focus-ring-themed'
        >
          {copy.allLabel}
        </Link>
      </MarketingContainer>
    </section>
  );
}
