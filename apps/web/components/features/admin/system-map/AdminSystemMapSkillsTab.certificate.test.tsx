import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

vi.mock('@/lib/agents/registry', () => ({
  SKILL_REGISTRY: {
    one: {
      id: 'one',
      name: 'Skill One',
      description: 'The first skill.',
      kind: 'tool',
      version: '1',
      model: 'test/model',
    },
  },
}));

describe('AdminSystemMapSkillsTab certificate', () => {
  it('lists the registered skills axe-clean', async () => {
    const { container } = render(<AdminSystemMapSkillsTab />);
    expect(screen.getByText(/1 skill registered/)).toBeInTheDocument();
    expect(screen.getByText('Skill One')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('expands a skill with no prompt doc axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminSystemMapSkillsTab />);
    await user.click(screen.getByRole('button', { name: /Skill One/ }));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
