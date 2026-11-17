import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityCard } from './OpportunityCard';

describe('OpportunityCard certificate', () => {
  it('selects a compact suggestion on click, axe-clean', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <OpportunityCard
        format='compact'
        title='Review release'
        description='Check credits and links.'
        icon={<span>*</span>}
        onSelect={onSelect}
        dataTestId='compact-card'
      />
    );

    const button = screen.getByRole('button', { name: 'Review release' });
    expect(button).toHaveAttribute('data-opportunity-format', 'compact');
    await user.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('ignores clicks while disabled', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <OpportunityCard
        format='compact'
        title='Downloading update'
        description='Ready when the download completes.'
        icon={<span />}
        onSelect={onSelect}
        disabled
      />
    );

    const button = screen.getByRole('button', { name: 'Downloading update' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders an editorial card without metadata or action', async () => {
    const { container } = render(
      <OpportunityCard
        format='editorial'
        title='Release review'
        description='Complete review context.'
        icon={<span />}
        metadata={null}
      >
        {null}
      </OpportunityCard>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Release review' })
    ).toBeVisible();
    expect(screen.getByText('Complete review context.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
