import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const registry = vi.hoisted(() => ({
  skills: {} as Record<string, Record<string, string>>,
  connectors: [] as Array<{ id: string; label: string; description: string }>,
}));

vi.mock('@/lib/agents/registry', () => ({
  get SKILL_REGISTRY() {
    return registry.skills;
  },
}));
vi.mock('@/lib/connectors/registry', () => ({
  getConnectorDefinitions: () => registry.connectors,
}));
vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { readonly content: string }) => (
    <pre data-testid='prompt-doc'>{content}</pre>
  ),
}));

import { AdminSystemMap } from './AdminSystemMap';

const LONG_DESCRIPTION =
  'Reads every release, tour date and merch drop from the connected account, then keeps them in step with the artist profile without asking for the same permission twice.';

describe('AdminSystemMap', () => {
  beforeEach(() => {
    registry.skills = {
      retouch: {
        id: 'retouch',
        name: 'Retouch',
        description: 'Image retouching',
        kind: 'tool',
        version: '1',
        model: 'test/image-model',
      },
      planner: {
        id: 'planner',
        name: 'Release Planner',
        description: 'Plans a release',
        kind: 'vertical_agent',
        version: '2',
        model: 'test/agent-model',
      },
    };
    registry.connectors = [
      { id: 'spotify', label: 'Spotify', description: LONG_DESCRIPTION },
      { id: 'gmail', label: 'Gmail', description: 'Reads replies' },
    ];
  });

  it('lists every connector with its description', async () => {
    const { container } = render(<AdminSystemMap activeTab='connectors' />);
    const list = screen.getByTestId('system-map-connectors');
    expect(within(list).getByText('Spotify')).toBeInTheDocument();
    expect(within(list).getByText(LONG_DESCRIPTION)).toBeInTheDocument();
    expect(within(list).getByText('Gmail')).toBeInTheDocument();
    expect(list.children).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('lists only tool skills, with their model, on the tools tab', async () => {
    const { container } = render(<AdminSystemMap activeTab='tools' />);
    const list = screen.getByTestId('system-map-tools');
    expect(within(list).getByText('Retouch')).toBeInTheDocument();
    expect(within(list).getByText('test/image-model')).toBeInTheDocument();
    expect(within(list).queryByText('Release Planner')).toBeNull();
    expect(screen.queryByTestId('system-map-tools-empty')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('says no tools are registered when the registry has none', async () => {
    registry.skills = { planner: registry.skills.planner };
    const { container } = render(<AdminSystemMap activeTab='tools' />);
    expect(screen.getByTestId('system-map-tools-empty')).toHaveTextContent(
      'No tools registered.'
    );
    await expectNoA11yViolations(container);
  });

  it('shows the tracked memory entity types', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AdminSystemMap activeTab='memory' />
      </div>
    );
    const memory = screen.getByTestId('system-map-memory');
    for (const type of ['person', 'artist', 'release', 'recording']) {
      expect(within(memory).getByText(type)).toBeInTheDocument();
    }
    expect(memory.querySelectorAll('span.inline-flex')).toHaveLength(12);
    await expectNoA11yViolations(container);
  });

  it('hands the skills tab to the skill cards, which open on click', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminSystemMap activeTab='skills' />);
    expect(screen.getByTestId('system-map-skills')).toHaveTextContent(
      '2 skills registered in SKILL_REGISTRY.'
    );
    const toggle = screen.getByRole('button', { name: /Release Planner/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
