import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  HomepageCertifiedSections,
  HomepageEditorialFeatureSection,
} from './HomepageCertifiedSections';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, loading, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

const subscribe = HOMEPAGE_MEDIA_MAP.relationships.asset;
const pay = HOMEPAGE_MEDIA_MAP.pay.asset;

describe('HomepageCertifiedSections certificate', () => {
  it('renders the one relationships section with both captioned exports', async () => {
    const { container } = render(
      <HomepageCertifiedSections previews={{ subscribe, pay }} />
    );

    const region = screen.getByRole('region', {
      name: 'Turn attention into relationships.',
    });
    expect(within(region).getAllByRole('img')).toHaveLength(2);
    expect(within(region).getAllByRole('figure')).toHaveLength(2);
    expect(region.querySelectorAll('figcaption')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('renders a single export without a caption', async () => {
    const { container } = render(
      <HomepageEditorialFeatureSection
        previews={[{ image: subscribe }]}
        section={{ id: 'single', headline: 'One step', body: 'Body copy.' }}
      />
    );

    const region = screen.getByRole('region', { name: 'One step' });
    expect(within(region).getAllByRole('img')).toHaveLength(1);
    expect(region.querySelector('figcaption')).toBeNull();
    expect(region).toHaveAttribute('data-media', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy as one labelled section', async () => {
    const headline = 'حوّل الانتباه إلى علاقات تدوم بعد يوم الإصدار والجولة.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageEditorialFeatureSection
          previews={[{ image: pay, caption: 'ادفع' }]}
          section={{ id: 'rtl', headline, body: 'كل زائر يمكنه الدفع لك.' }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: headline })
    ).toBeInTheDocument();
    expect(screen.getByText('ادفع')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([0, 3])('refuses %i previews', count => {
    const previews = Array.from({ length: count }, () => ({ image: pay }));
    expect(() =>
      render(
        <HomepageEditorialFeatureSection
          previews={previews}
          section={{ id: 'bad', headline: 'Bad', body: 'Bad.' }}
        />
      )
    ).toThrow('requires one or two real previews');
  });
});
