import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeRelationshipPanel } from './HomeRelationshipPanel';

describe('HomeRelationshipPanel', () => {
  it('lists each fan with the action and when it happened', async () => {
    const { container } = render(<HomeRelationshipPanel />);

    const rows = container.querySelectorAll('.homepage-relationship-row');
    expect(rows).toHaveLength(4);
    expect(screen.getByText('Leah Chen')).toBeInTheDocument();
    expect(screen.getByText('Tipped $10')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
    expect(screen.getByText('Ava Ruiz')).toBeInTheDocument();
    expect(screen.getAllByText('Yesterday')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('is decorative, so assistive technology skips it', async () => {
    const { container } = render(<HomeRelationshipPanel />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Marcus Vale')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomeRelationshipPanel />
      </div>
    );

    expect(screen.getByText('Jules Porter')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
