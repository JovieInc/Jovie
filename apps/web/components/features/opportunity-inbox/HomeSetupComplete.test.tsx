import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeSetupComplete } from './HomeSetupComplete';

const STEPS = [
  { label: 'Complete Your Profile', description: 'Profile', complete: true },
  { label: 'Connect Your Music', description: 'Music', complete: true },
  { label: 'Add Your Links', description: 'Links', complete: true },
] as const;

describe('HomeSetupComplete', () => {
  it('leads with one primary action and keeps setup out of the way', async () => {
    const { container } = render(<HomeSetupComplete steps={STEPS} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan Your Next Release' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
    expect(
      screen.getByRole('link', { name: 'View Completed Work' })
    ).toHaveAttribute('href', '/app?view=done');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens every finished step as a settings link and returns focus on Escape', async () => {
    render(<HomeSetupComplete steps={STEPS} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Setup Complete' }));
    const links = await screen.findAllByRole('link', { name: /— Complete/ });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('Complete Your Profile');

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('link', { name: /— Complete/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Setup Complete' })
    ).toHaveFocus();
  });
});
