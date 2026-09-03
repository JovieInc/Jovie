// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import {
  HOMEPAGE_CERTIFIED_FIGURES,
  HOMEPAGE_LAUNCH_COPY,
  type HomepageCertifiedLedgerRow,
  type HomepageCertifiedStats,
} from '@/data/homepageLaunchCopy';
import type { MarketingExportImage } from '@/lib/screenshots/registry';

export type HomepageCertifiedSectionId =
  (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number]['id'];

export interface HomepageCertifiedPreviews {
  /** Real public-profile export shown beside "Everything about you, connected." */
  readonly connected: MarketingExportImage;
  /** Real public-profile exports shown beside "Turn attention into relationships." */
  readonly relationships: readonly MarketingExportImage[];
}

export interface HomepageCertifiedSectionsProps {
  readonly previews: HomepageCertifiedPreviews;
}

/**
 * Sections cooked to the quiet voice: 28/32 Satoshi at 620, 15/24 support,
 * twelve-column optical grid, type-only figures on hairlines. Grows one
 * section at a time as each approved still lands; the rest keep the display
 * treatment.
 */
const QUIET_SECTION_IDS: ReadonlySet<HomepageCertifiedSectionId> =
  new Set<HomepageCertifiedSectionId>([
    'found',
    'know',
    'relationships',
    'smarter',
    'built',
  ]);

const PHONE_SIZES = '(min-width: 1024px) 15rem, (min-width: 768px) 24vw, 62vw';

function ProfilePhone({ image }: { readonly image: MarketingExportImage }) {
  return (
    <ArtistProfilePhoneFrame className='homepage-certified-section__device'>
      <Image
        alt={image.alt}
        className='homepage-certified-section__screen'
        height={image.height}
        loading='lazy'
        quality={85}
        sizes={PHONE_SIZES}
        src={image.publicUrl}
        width={image.width}
      />
    </ArtistProfilePhoneFrame>
  );
}

function Ledger({
  rows,
}: {
  readonly rows: readonly HomepageCertifiedLedgerRow[];
}) {
  return (
    <dl className='homepage-certified-ledger'>
      {rows.map(row => (
        <div className='homepage-certified-ledger__row' key={row.label}>
          <dt className='homepage-certified-ledger__label'>{row.label}</dt>
          <dd className='homepage-certified-ledger__line'>{row.line}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stats({ stats }: { readonly stats: HomepageCertifiedStats }) {
  return (
    <div className='homepage-certified-stats'>
      {stats.items.map(item => (
        <div className='homepage-certified-stats__item' key={item.label}>
          <p className='homepage-certified-stats__value'>{item.value}</p>
          <p className='homepage-certified-stats__label'>{item.label}</p>
        </div>
      ))}
      <p className='homepage-certified-stats__caption'>{stats.caption}</p>
    </div>
  );
}

function Routes({ routes }: { readonly routes: readonly string[] }) {
  return (
    <ul className='homepage-certified-routes'>
      {routes.map(route => (
        <li className='homepage-certified-routes__item' key={route}>
          {route}
        </li>
      ))}
    </ul>
  );
}

function sectionMedia(
  id: HomepageCertifiedSectionId,
  previews: HomepageCertifiedPreviews
): ReactNode {
  if (id === 'connected') {
    return (
      <div className='homepage-certified-section__phones' data-count='1'>
        <ProfilePhone image={previews.connected} />
      </div>
    );
  }
  if (id === 'relationships') {
    return (
      <div
        className='homepage-certified-section__phones'
        data-count={String(previews.relationships.length)}
      >
        {previews.relationships.map(image => (
          <ProfilePhone image={image} key={image.publicUrl} />
        ))}
      </div>
    );
  }
  return null;
}

/** Type-only figure for a quiet section: a ledger or the stats row. */
function sectionFigure(id: HomepageCertifiedSectionId): ReactNode {
  const ledger = HOMEPAGE_CERTIFIED_FIGURES.ledgers[id];
  if (ledger) {
    return (
      <div className='homepage-certified-section__figure'>
        <Ledger rows={ledger} />
      </div>
    );
  }
  const stats = HOMEPAGE_CERTIFIED_FIGURES.stats[id];
  if (stats) {
    return (
      <div className='homepage-certified-section__figure homepage-certified-section__figure--stats'>
        <Stats stats={stats} />
      </div>
    );
  }
  return null;
}

/**
 * Sections 2-8 of the certified homepage. Copy is locked in
 * HOMEPAGE_LAUNCH_COPY.certified; this component only owns rhythm: one quiet
 * proof statement, then six top-ruled editorial sections on the shared
 * content column, alternating sides, with real product exports where they
 * exist, type-only figures where a section has been cooked to the quiet
 * voice, and nothing where neither applies.
 */
export function HomepageCertifiedSections({
  previews,
}: HomepageCertifiedSectionsProps) {
  const { proof, sections } = HOMEPAGE_LAUNCH_COPY.certified;

  return (
    <>
      <section
        className='homepage-certified-proof'
        data-testid='homepage-proof'
        aria-label='Proof'
      >
        <p className='homepage-certified-proof__statement'>{proof.statement}</p>
      </section>
      {sections.map((section, index) => {
        const headingId = `homepage-section-${section.id}-heading`;
        const media = sectionMedia(section.id, previews);
        const quiet = QUIET_SECTION_IDS.has(section.id);
        const figure = quiet ? sectionFigure(section.id) : null;
        const routes = quiet
          ? HOMEPAGE_CERTIFIED_FIGURES.routes[section.id]
          : undefined;
        const washed =
          quiet && Boolean(HOMEPAGE_CERTIFIED_FIGURES.stats[section.id]);

        return (
          <section
            key={section.id}
            id={section.id}
            className='homepage-certified-section'
            data-testid={`homepage-section-${section.id}`}
            data-align={index % 2 === 0 ? 'start' : 'end'}
            data-media={media ? 'true' : 'false'}
            data-voice={quiet ? 'quiet' : 'display'}
            data-figure={figure ? 'true' : 'false'}
            data-wash={washed ? 'true' : 'false'}
            aria-labelledby={headingId}
          >
            <div className='homepage-certified-section__inner'>
              <div className='homepage-certified-section__copy'>
                <h2
                  id={headingId}
                  className='homepage-certified-section__headline'
                  data-homepage-section-heading
                >
                  {section.headline}
                </h2>
                <p className='homepage-certified-section__body'>
                  {section.body}
                </p>
                {routes ? <Routes routes={routes} /> : null}
              </div>
              {media ? (
                <div className='homepage-certified-section__media'>{media}</div>
              ) : null}
              {figure}
            </div>
          </section>
        );
      })}
    </>
  );
}
