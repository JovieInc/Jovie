// @coverage-via apps/web/components/homepage/HomepageEditorialChangelog.test.tsx
/* eslint-disable @jovie/canonical-ui-label-casing -- founder-locked marketing heading uses approved sentence case. */
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

/**
 * The homepage preview is intentionally a small, source-backed projection of
 * published changelog entries. Keep the version URL beside each card so a
 * stale or unpublished title cannot become a synthetic homepage claim.
 */
export const HOMEPAGE_EDITORIAL_CARDS = [
  {
    version: '26.8.2',
    title: 'iPhone chat is home',
    category: 'Product',
    date: 'August 31, 2026',
    theme: 'blue',
    themeTitle: 'Ask Jovie.',
    themeSupport: 'Now at home on iPhone.',
  },
  {
    version: '26.8.1',
    title: 'Profile actions stay truthful and usable',
    category: 'Improvement',
    date: 'August 16, 2026',
    theme: 'pink',
    themeTitle: 'Your profile.',
    themeSupport: 'Every action in its place.',
  },
  {
    version: '26.8.0',
    title: 'See how visible you are online',
    category: 'Product',
    date: 'August 14, 2026',
    theme: 'green',
    themeTitle: 'Be seen.',
    themeSupport: 'Know your presence.',
  },
] as const;

export function HomepageEditorialChangelog() {
  return (
    <section
      className='homepage-editorial-changelog'
      data-testid='homepage-editorial-changelog'
      data-marketing-owner='apps/web/components/homepage/HomepageEditorialChangelog.tsx'
      data-marketing-variant='editorial-preview'
      aria-labelledby='homepage-editorial-changelog-heading'
    >
      <div className='homepage-editorial-changelog__inner'>
        <div className='homepage-editorial-changelog__header'>
          <h2
            id='homepage-editorial-changelog-heading'
            className='homepage-editorial-changelog__heading'
          >
            What&apos;s new in Jovie
          </h2>
          <Link
            className='homepage-editorial-changelog__all-posts'
            href={APP_ROUTES.CHANGELOG}
          >
            All posts
          </Link>
        </div>

        <div className='homepage-editorial-changelog__grid'>
          {HOMEPAGE_EDITORIAL_CARDS.map(card => (
            <article key={card.version} className='homepage-editorial-card'>
              <Link
                className='homepage-editorial-card__link'
                href={`${APP_ROUTES.CHANGELOG}/${card.version}`}
              >
                <div
                  aria-label={`${card.title}: ${card.themeSupport}`}
                  className={`homepage-editorial-card__media homepage-editorial-card__media--${card.theme}`}
                  role='img'
                >
                  <span className='homepage-editorial-card__theme-title'>
                    {card.themeTitle}
                  </span>
                  <span className='homepage-editorial-card__theme-support'>
                    {card.themeSupport}
                  </span>
                </div>
                <h3 className='homepage-editorial-card__title'>{card.title}</h3>
                <p className='homepage-editorial-card__meta'>
                  {card.category} · {card.date}
                </p>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
