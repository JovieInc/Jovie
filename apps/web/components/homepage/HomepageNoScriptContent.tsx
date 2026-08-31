import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

/**
 * Keep the homepage useful when JavaScript is unavailable.
 *
 * This is deliberately real, user-readable SSR content rather than
 * crawler-only copy. The home stylesheet hides it for scripting-enabled
 * browsers, while agents and people without JavaScript get the same canonical
 * homepage proposition and public routes. Keeping the section in ordinary
 * HTML is important: non-rendering readers do not expose `<noscript>` content.
 */
export function HomepageNoScriptContent() {
  const { hero, workspace, productStatement, profileProof, faq } =
    HOMEPAGE_LAUNCH_COPY;

  return (
    <section
      aria-labelledby='homepage-no-script-heading'
      className='homepage-no-script-content'
    >
      {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- Preserve approved sentence-case homepage copy. */}
      <h2 id='homepage-no-script-heading'>Jovie for artists</h2>
      <p>{hero.headline}</p>
      <p>{hero.subhead}</p>

      <h3>{workspace.kicker}</h3>
      <p>{workspace.headline.replaceAll('\n', ' ')}</p>
      <ul>
        {workspace.callouts.map(callout => (
          <li key={callout.key}>
            <strong>{callout.title}</strong> {callout.body}
          </li>
        ))}
      </ul>

      <h3>{productStatement.body}</h3>
      <p>{productStatement.description}</p>
      <ul>
        {productStatement.cards.map(card => (
          <li key={card.title}>
            <strong>{card.title}</strong> {card.body}
          </li>
        ))}
      </ul>

      <h3>{profileProof.headline}</h3>
      <p>{profileProof.body}</p>
      <ul>
        {profileProof.items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h3>Questions</h3>
      <dl>
        {faq.map(item => (
          <div key={item.question}>
            <dt>
              <strong>{item.question}</strong>
            </dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>

      <p>
        <a href={hero.primaryCta.href}>{hero.primaryCta.label}</a>{' '}
        <a href={hero.secondaryCta.href}>{hero.secondaryCta.label}</a>{' '}
        <a href={APP_ROUTES.SUPPORT}>Contact support</a>
      </p>
    </section>
  );
}
