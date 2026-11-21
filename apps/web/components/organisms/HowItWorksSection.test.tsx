import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HowItWorksSection } from './HowItWorksSection';

describe('HowItWorksSection', () => {
  it('renders the default steps in order, keeps focus order stable and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<HowItWorksSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: /fan conversion/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Get Your Link')).toBeInTheDocument();
    await user.tab();
    expect(document.body).toContainElement(document.activeElement);
    await expectNoA11yViolations(container);
  });

  it('draws the accent border from semantic tokens and can omit it', () => {
    const { container, rerender } = render(<HowItWorksSection />);

    expect(container.innerHTML).toContain('from-accent-blue/50');
    expect(container.innerHTML).not.toContain('from-blue-500');
    rerender(<HowItWorksSection showAccentBorder={false} />);
    expect(container.innerHTML).not.toContain('from-accent-blue/50');
  });

  it('renders no steps and has no axe violations', async () => {
    const { container } = render(<HowItWorksSection steps={[]} />);

    expect(screen.queryByText('Get Your Link')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
