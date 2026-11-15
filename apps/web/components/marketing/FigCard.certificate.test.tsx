import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FigCard } from './FigCard';

describe('FigCard certificate', () => {
  it('renders the icon, title and description axe-clean', async () => {
    const { container } = render(
      <FigCard
        title='Built for artists'
        description='One home for every release moment.'
        icon={<svg aria-hidden='true' data-testid='fig-icon' />}
        className='extra'
      />
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Built for artists' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('fig-icon')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(
      'homepage-surface-card',
      'extra'
    );
    await expectNoA11yViolations(container);
  });

  it('drops the icon slot when no icon is passed', async () => {
    const { container } = render(
      <FigCard title='Automated releases' description='Smart links.' />
    );

    expect(container.querySelector('.mb-5')).toBeNull();
    expect(screen.getByText('Smart links.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps right-to-left copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FigCard title='مصمم للفنانين' description='بيت واحد لكل إصدار.' />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'مصمم للفنانين' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
