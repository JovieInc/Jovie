import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';
import { EntityMentionText } from './EntityMentionText';

interface ProfileAeoContentProps {
  readonly content: ProfileAeoContentModel;
}

/**
 * Indexable About/FAQ copy for crawlers and assistive tech. Nothing renders
 * below the profile footer: the same facts, description and sourced FAQ stay
 * in the static DOM (and in the page's JSON-LD) but are visually hidden, so
 * the page has one visible About (the in-profile About tab) and no second
 * design language beneath it.
 */
export function ProfileAeoContent({ content }: ProfileAeoContentProps) {
  return (
    <section
      aria-labelledby='profile-aeo-heading'
      className='profile-aeo-content sr-only'
      data-testid='profile-aeo-content'
    >
      <h2 id='profile-aeo-heading'>About {content.artistName}</h2>

      {content.facts.length > 0 ? (
        <dl data-testid='profile-about-facts'>
          {content.facts.map(fact => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className='profile-aeo-content__body'>
        {content.descriptionSegments.map((segments, index) => (
          <p key={content.description[index] ?? index}>
            <EntityMentionText segments={segments} />
          </p>
        ))}
      </div>

      {content.faqs.length > 0 ? (
        <div>
          <h3>{content.artistName} FAQ</h3>
          <dl className='profile-aeo-content__faq-list'>
            {content.faqs.map(item => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd className='profile-aeo-content__answer'>
                  <span>{item.answer}</span>{' '}
                  <a href={item.source.href}>Source: {item.source.label}</a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
