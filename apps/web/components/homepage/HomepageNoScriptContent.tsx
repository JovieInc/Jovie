import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

/**
 * Keep the homepage useful when JavaScript is unavailable.
 *
 * This is deliberately real, user-readable SSR content rather than
 * crawler-only copy: the same nine certified sections the scripted page
 * renders, in the same order. The home stylesheet hides it for
 * scripting-enabled browsers, while agents and people without JavaScript get
 * the same canonical proposition and public routes. Keeping the section in
 * ordinary HTML is important: non-rendering readers do not expose
 * `<noscript>` content.
 */
export function HomepageNoScriptContent() {
  const { hero, certified } = HOMEPAGE_LAUNCH_COPY;

  return (
    <section
      aria-labelledby='homepage-no-script-heading'
      className='homepage-no-script-content'
    >
      <h2 id='homepage-no-script-heading'>{hero.headline}</h2>
      <p>{hero.subhead}</p>
      <p>{certified.proof.statement}</p>

      {certified.sections.map(section => (
        <div key={section.id}>
          <h3>{section.headline}</h3>
          <p>{section.body}</p>
        </div>
      ))}

      <h3>{certified.close.headline}</h3>
      <p>{certified.close.support}</p>

      <p>
        <a href={APP_ROUTES.START}>{hero.search.action}</a>{' '}
        <a href={APP_ROUTES.SUPPORT}>Contact support</a>
      </p>
    </section>
  );
}
