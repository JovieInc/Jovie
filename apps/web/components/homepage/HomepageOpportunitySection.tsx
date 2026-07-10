import type { ReactNode } from 'react';

export interface HomepageOpportunityItem {
  readonly title: string;
  readonly body: string;
}

export interface HomepageOpportunitySectionProps {
  readonly headline: string;
  readonly description: string;
  readonly opportunities: readonly HomepageOpportunityItem[];
  readonly demo?: ReactNode;
}

export function HomepageOpportunitySection({
  headline,
  description,
  opportunities,
  demo,
}: Readonly<HomepageOpportunitySectionProps>) {
  return (
    <section
      className='homepage-opportunity-section system-b-home-opportunity-section'
      data-testid='homepage-opportunity-section'
      aria-labelledby='homepage-opportunity-heading'
    >
      <div className='homepage-opportunity-section__inner system-b-home-opportunity-section-inner'>
        <div className='homepage-opportunity-section__copy system-b-home-opportunity-section-copy'>
          <h2
            id='homepage-opportunity-heading'
            className='homepage-opportunity-section__headline system-b-home-opportunity-section-headline'
          >
            {headline}
          </h2>
          <p
            className='homepage-opportunity-section__description system-b-home-opportunity-section-description'
            data-testid='homepage-opportunity-description'
          >
            {description}
          </p>
        </div>

        <ol
          className='homepage-opportunity-section__list system-b-home-opportunity-section-list'
          data-testid='homepage-opportunity-list'
        >
          {opportunities.map(opportunity => (
            <li
              className='homepage-opportunity-section__item system-b-home-opportunity-section-item'
              data-testid='homepage-opportunity-item'
              key={opportunity.title}
            >
              <h3 className='homepage-opportunity-section__item-title system-b-home-opportunity-section-item-title'>
                {opportunity.title}
              </h3>
              <p className='homepage-opportunity-section__item-body system-b-home-opportunity-section-item-body'>
                {opportunity.body}
              </p>
            </li>
          ))}
        </ol>

        <aside
          className='homepage-opportunity-section__demo system-b-home-opportunity-section-demo'
          data-testid='homepage-opportunity-demo'
          aria-label='Jovie Opportunity Demo'
        >
          {demo}
        </aside>
      </div>
    </section>
  );
}
