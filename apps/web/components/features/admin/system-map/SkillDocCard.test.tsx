import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { readonly content: string }) => (
    <pre data-testid='prompt-doc'>{content}</pre>
  ),
}));

import { SkillDocCard } from './SkillDocCard';

const LONG_NAME =
  'Release Planner for multi-territory deluxe anniversary editions with staggered single drops';
const LONG_DESCRIPTION =
  'Builds a release plan from the artist timeline, the distributor delivery windows, every confirmed press date and the merch production schedule.';

const PROPS = {
  id: 'release-planner',
  name: 'Release Planner',
  description: 'Builds a release plan from the artist timeline.',
  kind: 'vertical_agent',
  model: 'openai/gpt-5',
  version: '1.0.0',
  promptContent: '# Release Planner\n\nPreserve artist intent.',
};

describe('SkillDocCard', () => {
  it('starts collapsed with the skill metadata on the toggle', async () => {
    const { container } = render(<SkillDocCard {...PROPS} />);
    const toggle = screen.getByRole('button', { name: /Release Planner/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('skill-card-release-planner')).toContainElement(
      toggle
    );
    expect(screen.getByText('vertical_agent')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('openai/gpt-5')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-doc')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens and closes the prompt doc by click and by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(<SkillDocCard {...PROPS} />);
    const toggle = screen.getByRole('button', { name: /Release Planner/ });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('prompt-doc')).toHaveTextContent(
      'Preserve artist intent.'
    );
    expect(screen.queryByText('No prompt doc for this skill.')).toBeNull();
    await expectNoA11yViolations(container);

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('prompt-doc')).toBeNull();
  });

  it('says there is no prompt doc when an empty skill is opened', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SkillDocCard {...PROPS} id='missing-prompt' promptContent={null} />
    );
    expect(screen.queryByText('No prompt doc for this skill.')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Release Planner/ }));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-doc')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('treats an empty prompt string as no prompt doc', async () => {
    const user = userEvent.setup();
    render(<SkillDocCard {...PROPS} promptContent='' />);
    await user.click(screen.getByRole('button', { name: /Release Planner/ }));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
  });

  it('shows long copy in full inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SkillDocCard
          {...PROPS}
          name={LONG_NAME}
          description={LONG_DESCRIPTION}
        />
      </div>
    );
    expect(screen.getByText(LONG_NAME)).toBeInTheDocument();
    expect(screen.getByText(LONG_DESCRIPTION)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
