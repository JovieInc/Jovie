import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

/**
 * Keep the homepage useful when JavaScript is unavailable.
 *
 * This is deliberately a real, user-readable fallback rather than
 * crawler-only copy. Browsers with scripting enabled ignore the `noscript`
 * element, while agents and people without JavaScript get the same canonical
 * homepage proposition and public routes.
 */
export function HomepageNoScriptContent() {
  const { hero, workspace, productStatement, profileProof, faq } =
    HOMEPAGE_LAUNCH_COPY;

  return (
    <noscript>
      <section
        aria-labelledby='homepage-no-script-heading'
        className='homepage-no-script-content'
      >
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
    </noscript>
  );
}
