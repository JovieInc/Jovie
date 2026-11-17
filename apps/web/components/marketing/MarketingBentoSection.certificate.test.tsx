import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type MarketingBentoCard,
  MarketingBentoSection,
} from './MarketingBentoSection';

const card = (
  id: string,
  title: string,
  extra: Partial<MarketingBentoCard> = {}
) => ({ id, title, body: `${title} body.`, ...extra }) as MarketingBentoCard;

function renderSection(cards: Record<string, MarketingBentoCard>) {
  return render(
    <MarketingBentoSection
      eyebrow='Inside Jovie'
      title='Your release work, connected.'
      titleId='bento-cert-title'
      description='Shared release and fan activity.'
      featuredStart={cards.featuredStart!}
      supportingTop={cards.supportingTop!}
      supportingBottom={cards.supportingBottom!}
      featuredEnd={cards.featuredEnd!}
    />
  );
}

describe('MarketingBentoSection certificate', () => {
  it('renders four labelled cards with previews and actions axe-clean', async () => {
    const { container } = renderSection({
      featuredStart: card('plan', 'Know what ships next', {
        preview: <div />,
        previewLabel: 'Release preview',
        action: { href: '/start', label: 'Plan a release' },
      }),
      supportingTop: card('profile', 'One profile'),
      supportingBottom: card('signals', 'Signals'),
      featuredEnd: card('fans', 'Keep every fan close', {
        preview: <div />,
        previewLabel: 'Fan preview',
        previewAspect: 'square',
      }),
    });

    const section = screen.getByRole('region', {
      name: 'Your release work, connected.',
    });
    const articles = within(section).getAllByRole('article');
    expect(articles).toHaveLength(4);
    expect(articles[0]).toHaveAccessibleName('Know what ships next');
    expect(articles[0]).toHaveAccessibleDescription(
      'Know what ships next body.'
    );
    expect(
      screen.getByRole('figure', { name: 'Release preview' })
    ).toHaveAttribute('data-preview-aspect', 'portrait');
    expect(screen.getByRole('figure', { name: 'Fan preview' })).toHaveAttribute(
      'data-preview-aspect',
      'square'
    );
    expect(
      screen.getByRole('link', { name: 'Plan a release' })
    ).toHaveAttribute('href', '/start');
    await expectNoA11yViolations(container);
  });

  it('renders copy-only cards with no figures or links', async () => {
    const { container } = renderSection({
      featuredStart: card('a', 'A'),
      supportingTop: card('b', 'B'),
      supportingBottom: card('c', 'C'),
      featuredEnd: card('d', 'D'),
    });

    expect(screen.queryAllByRole('figure')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    for (const article of screen.getAllByRole('article')) {
      expect(article).toHaveAttribute('data-has-preview', 'false');
    }
    await expectNoA11yViolations(container);
  });

  it('keeps right-to-left cards axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingBentoSection
          eyebrow='داخل جوفي'
          title='عمل إصدارك، متصل.'
          titleId='bento-rtl-title'
          description='في مكان واحد.'
          featuredStart={card('a', 'اعرف ما سيصدر تاليًا')}
          supportingTop={card('b', 'صفحة واحدة')}
          supportingBottom={card('c', 'مؤشرات')}
          featuredEnd={card('d', 'المعجبون')}
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'عمل إصدارك، متصل.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
