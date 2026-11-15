import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FeatureCard } from './FeatureCard';

const icon = <svg data-testid='icon' aria-hidden='true' />;

describe('FeatureCard certificate', () => {
  it('shows the title, metric badge and description, axe-clean', async () => {
    const { container } = render(
      <FeatureCard
        title='3.2x Faster Loading'
        description='Fans discover your music instantly.'
        metric='3.2x faster'
        icon={icon}
      />
    );

    expect(
      screen.getByRole('heading', { level: 3, name: '3.2x Faster Loading' })
    ).toBeVisible();
    expect(screen.getByText('3.2x faster')).toHaveClass('rounded-full');
    expect(
      screen.getByText('Fans discover your music instantly.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('omits the badge when there is no metric (partial)', async () => {
    const { container } = render(
      <FeatureCard
        title='Insights'
        description='See what matters'
        icon={icon}
        interactive={false}
      />
    );

    expect(container.querySelector('.rounded-full')).toBeNull();
    expect(screen.getByText('See what matters')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy whole and axe-clean', async () => {
    const longTitle =
      'Every release page, smart link and pre-save campaign ready on release day';
    const { container } = render(
      <div dir='rtl'>
        <FeatureCard
          title={longTitle}
          description='يكتشف المعجبون موسيقاك فورًا دون انتظار.'
          metric='أسرع ٣٫٢ مرة'
          icon={icon}
        />
      </div>
    );

    expect(screen.getByRole('heading', { name: longTitle })).toBeVisible();
    expect(screen.getByText('أسرع ٣٫٢ مرة')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
