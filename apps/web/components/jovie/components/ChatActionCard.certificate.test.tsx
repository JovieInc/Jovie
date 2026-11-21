import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatActionCard } from './ChatActionCard';

const baseProps = {
  title: 'Review imported links',
  body: 'Jovie found three profile links.',
  actionLabel: 'Review links',
};

describe('ChatActionCard certificate', () => {
  it('runs the primary action and dismiss handlers', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <ChatActionCard {...baseProps} onAct={onAct} onDismiss={onDismiss} />
    );

    await user.click(screen.getByRole('button', { name: 'Review links' }));
    expect(onAct).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Review imported links' })
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('extends the action name with the aria label when given', async () => {
    const { container } = render(
      <ChatActionCard
        {...baseProps}
        ariaLabel='three links'
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Review links — three links' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
