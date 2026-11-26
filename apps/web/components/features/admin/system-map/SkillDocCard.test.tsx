import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SkillDocCard } from './SkillDocCard';

const base = {
  id: 'release-planner',
  name: 'Release Planner',
  description: 'Builds a release plan from the artist timeline.',
  kind: 'vertical_agent',
  model: 'openai/gpt-5',
  version: '1.0.0',
};

describe('SkillDocCard', () => {
  it('shows the skill header collapsed by default', async () => {
    const { container } = render(
      <SkillDocCard {...base} promptContent='# Planner\n\nBody text.' />
    );
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle).toHaveTextContent('Release Planner');
    expect(toggle).toHaveTextContent('v1.0.0');
    expect(screen.queryByText('Body text.')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('expands to the prompt doc and collapses again', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SkillDocCard {...base} promptContent={'# Planner\n\nBody text.'} />
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Body text.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('Body text.')).not.toBeInTheDocument();
  });

  it('says so when an expanded skill has no prompt doc', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SkillDocCard {...base} promptContent={null} />
    );
    await user.click(screen.getByRole('button'));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
