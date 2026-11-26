import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskExplainerPopover } from './ReleaseTaskExplainerPopover';

describe('ReleaseTaskExplainerPopover', () => {
  it('keeps the closed trigger axe-clean and focusable', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskExplainerPopover explainerText='Pitch early.' />
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Task Info' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('opens the explainer with its learn-more link on click', async () => {
    const user = userEvent.setup();
    render(
      <ReleaseTaskExplainerPopover
        explainerText='Pitch early.'
        learnMoreUrl='https://example.com/guide'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Task Info' }));
    expect(await screen.findByText('Pitch early.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      'https://example.com/guide'
    );
  });

  it('omits the learn-more link when no url is given', async () => {
    const user = userEvent.setup();
    render(<ReleaseTaskExplainerPopover explainerText='Pitch early.' />);

    await user.click(screen.getByRole('button', { name: 'Task Info' }));
    expect(await screen.findByText('Pitch early.')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
