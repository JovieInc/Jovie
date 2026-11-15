import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CLI_DOCUMENTED_COMMANDS,
  CLI_FAQ_ITEMS,
  CLI_HEADLINE,
  CLI_PRIMARY_CTA_LABEL,
  CliLandingPage,
} from './CliLandingPage';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

describe('CliLandingPage certificate', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it('renders the documented CLI surface axe-clean', async () => {
    const { container } = render(<CliLandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: CLI_HEADLINE })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: CLI_PRIMARY_CTA_LABEL })[0]
    ).toHaveAttribute('href', '#install');
    for (const { command } of CLI_DOCUMENTED_COMMANDS) {
      expect(screen.getAllByText(command).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByRole('region', { name: 'Give a creator a profile command' })
    ).toHaveAttribute('tabindex', '0');
    await expectNoA11yViolations(container);
  });

  it('opens a question and records the CLI FAQ event', async () => {
    const user = userEvent.setup();
    const { container } = render(<CliLandingPage />);
    const first = CLI_FAQ_ITEMS[0];
    const trigger = screen.getByRole('button', { name: first.question });

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.answer)).toBeVisible();
    expect(track).toHaveBeenCalledWith('cli_faq_opened', {
      source: 'cli',
      question: first.question,
      index: 0,
    });
    await expectNoA11yViolations(container);

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(track).toHaveBeenCalledTimes(1);
  });
});
