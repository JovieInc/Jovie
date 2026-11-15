import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BenefitsSection } from './BenefitsSection';

describe('BenefitsSection', () => {
  it('renders the default header and three benefits, axe-clean', async () => {
    const { container } = render(<BenefitsSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Built for musicians, optimized for conversion',
      })
    ).toBeVisible();
    expect(screen.getByText('The Solution')).toBeVisible();
    for (const title of [
      '3.2x Faster Loading',
      '47% More Streams',
      'Smart Fan Routing',
    ]) {
      expect(screen.getByText(title)).toBeVisible();
    }
    expect(screen.getByText('+47% conversion')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders caller copy and benefits in order, axe-clean', async () => {
    const { container } = render(
      <BenefitsSection
        title='Everything you need to grow'
        description='Purpose-built tools for independent artists.'
        badgeText='Why Jovie'
        className='mt-4'
        benefits={[
          {
            title: 'Instant setup',
            description: 'Live in under two minutes.',
            metric: '2 min setup',
            accent: 'blue',
          },
          {
            title: 'Real analytics',
            description: 'See where fans come from.',
            metric: 'Full funnel data',
            accent: 'green',
          },
        ]}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Everything you need to grow' })
    ).toBeVisible();
    expect(screen.getByText('Why Jovie')).toBeVisible();
    expect(screen.queryByText('3.2x Faster Loading')).not.toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('mt-4');
    const titles = ['Instant setup', 'Real analytics'].map(title =>
      screen.getByText(title)
    );
    expect(
      titles[0].compareDocumentPosition(titles[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('keeps the header with an empty benefit list, axe-clean', async () => {
    const { container } = render(<BenefitsSection benefits={[]} />);

    expect(
      screen.getByRole('heading', {
        name: 'Built for musicians, optimized for conversion',
      })
    ).toBeVisible();
    expect(screen.queryByText('3.2x Faster Loading')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy axe-clean', async () => {
    const description = 'Long description copy that wraps. '.repeat(8).trim();
    const { container } = render(
      <div dir='rtl'>
        <BenefitsSection title='مصمم للموسيقيين' description={description} />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'مصمم للموسيقيين' })
    ).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
