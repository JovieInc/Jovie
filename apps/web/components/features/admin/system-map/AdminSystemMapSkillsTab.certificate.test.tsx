import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const registry = vi.hoisted(() => ({
  skills: {} as Record<string, Record<string, string>>,
}));

vi.mock('@/lib/agents/registry', () => ({
  get SKILL_REGISTRY() {
    return registry.skills;
  },
}));
vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { readonly content: string }) => (
    <pre data-testid='prompt-doc'>{content}</pre>
  ),
}));

import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

const LONG_DESCRIPTION =
  'Builds a release plan from the artist timeline, the distributor delivery windows, every confirmed press date and the merch production schedule.';

function skill(id: string, name: string, extra: Record<string, string> = {}) {
  return {
    id,
    name,
    description: `${name} description`,
    kind: 'tool',
    version: '1',
    model: 'test/model',
    ...extra,
  };
}

describe('AdminSystemMapSkillsTab certificate states', () => {
  beforeEach(() => {
    registry.skills = {
      retouch: skill('retouch', 'Retouch', {
        promptPath: 'apps/web/lib/services/retouching/styles/white-space.md',
      }),
      planner: skill('planner', 'Release Planner', {
        description: LONG_DESCRIPTION,
      }),
    };
  });

  it('counts the registered skills and renders a card for each', async () => {
    const { container } = render(<AdminSystemMapSkillsTab />);
    expect(screen.getByTestId('system-map-skills')).toHaveTextContent(
      '2 skills registered in SKILL_REGISTRY. Click a skill to expand its prompt doc.'
    );
    expect(screen.getByTestId('skill-card-retouch')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-planner')).toBeInTheDocument();
    expect(screen.getByText(LONG_DESCRIPTION)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('uses the singular for one skill', () => {
    registry.skills = { retouch: registry.skills.retouch };
    render(<AdminSystemMapSkillsTab />);
    expect(screen.getByTestId('system-map-skills')).toHaveTextContent(
      '1 skill registered in SKILL_REGISTRY.'
    );
  });

  it('shows only the count line when the registry is empty', async () => {
    registry.skills = {};
    const { container } = render(<AdminSystemMapSkillsTab />);
    expect(screen.getByTestId('system-map-skills')).toHaveTextContent(
      '0 skills registered in SKILL_REGISTRY.'
    );
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens the bundled prompt for a skill that has one and says so when it has none', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <AdminSystemMapSkillsTab />
      </div>
    );
    await user.click(screen.getByRole('button', { name: /Retouch/ }));
    expect(
      screen.getByTestId('prompt-doc').textContent?.length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Release Planner/ }));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
