import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

/**
 * Keep the homepage useful when JavaScript is unavailable.
 *
 * This is deliberately real, user-readable SSR content rather than
 * crawler-only copy: the same locked editorial sections the scripted page
 * renders, in the same order. The home stylesheet hides it for
 * scripting-enabled browsers, while agents and people without JavaScript get
 * the same canonical proposition and public routes. Keeping the section in
 * ordinary HTML is important: non-rendering readers do not expose
 * `<noscript>` content.
 */
export function HomepageNoScriptContent() {
  const { hero, sections, close } = HOMEPAGE_IDENTITY_COPY;

  return (
    <section
      aria-labelledby='homepage-no-script-heading'
      className='homepage-no-script-content'
      data-marketing-runtime-state='no-script-fallback'
      data-marketing-owner='apps/web/components/homepage/HomepageNoScriptContent.tsx'
    >
      <h2 id='homepage-no-script-heading'>{hero.headline}</h2>
      <p>{hero.subhead}</p>

      {sections.map(section => (
        <div key={section.id}>
          <h3>{section.headline}</h3>
          <p>{section.body}</p>
        </div>
      ))}

      <h3>{close.headline}</h3>

      <p>
        <a href={APP_ROUTES.START}>
          {hero.claim.action} {hero.claim.domain}
          {hero.claim.placeholder}
        </a>{' '}
        <a href={APP_ROUTES.SUPPORT}>Contact support</a>
      </p>
    </section>
  );
}
