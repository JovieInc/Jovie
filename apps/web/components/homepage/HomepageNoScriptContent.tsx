import { APP_ROUTES } from '@/constants/routes';
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

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
  const { hero, certified } = HOMEPAGE_LAUNCH_COPY;
  const primary = FEATURE_FLAGS.WAITLIST_ENABLED
    ? getHomepageFrontDoorCtaContract(true).primary
    : { href: APP_ROUTES.START, label: certified.close.action };

  return (
    <section
      aria-labelledby='homepage-no-script-heading'
      className='homepage-no-script-content'
      data-marketing-runtime-state='no-script-fallback'
      data-marketing-owner='apps/web/components/homepage/HomepageNoScriptContent.tsx'
    >
      <h2 id='homepage-no-script-heading'>{hero.headline}</h2>
      <p>{hero.subhead}</p>

      {certified.sections.map(section => (
        <div key={section.id}>
          <h3>{section.headline}</h3>
          <p>{section.body}</p>
          {section.id === 'presence' ? (
            <>
              <h4>{section.step.headline}</h4>
              <p>{section.step.body}</p>
            </>
          ) : (
            <>
              <h4>{section.identity.title}</h4>
              <ul>
                {section.possibilities.items.map(item => (
                  <li key={item.id}>
                    {item.title}: {item.detail}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}

      <h3>{certified.close.headline}</h3>

      <p>
        <a href={primary.href}>{primary.label}</a>{' '}
        <a href={APP_ROUTES.SUPPORT}>Contact support</a>
      </p>
    </section>
  );
}
