import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminSystemMap } from './AdminSystemMap';

const registry = vi.hoisted(() => ({
  skills: {} as Record<string, unknown>,
}));

vi.mock('@/lib/agents/registry', () => ({
  get SKILL_REGISTRY() {
    return registry.skills;
  },
}));

vi.mock('@/lib/connectors/registry', () => ({
  getConnectorDefinitions: () => [
    { id: 'spotify', label: 'Spotify', description: 'Streaming data.' },
  ],
}));

const tool = {
  id: 'retouch',
  name: 'Retouch',
  description: 'Image retouching',
  kind: 'tool',
  version: '1',
  model: 'test/model',
};

describe('AdminSystemMap', () => {
  it('renders the connectors tab', async () => {
    const { container } = render(<AdminSystemMap activeTab='connectors' />);
    expect(screen.getByTestId('system-map-connectors')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders registered tools and filters out other kinds', async () => {
    registry.skills = {
      retouch: tool,
      agent: { ...tool, id: 'agent', name: 'Planner', kind: 'vertical_agent' },
    };
    const { container } = render(<AdminSystemMap activeTab='tools' />);
    expect(screen.getByText('Retouch')).toBeInTheDocument();
    expect(screen.queryByText('Planner')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the empty state when no tools are registered', async () => {
    registry.skills = {};
    const { container } = render(<AdminSystemMap activeTab='tools' />);
    expect(screen.getByTestId('system-map-tools-empty')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the memory entity types', async () => {
    const { container } = render(<AdminSystemMap activeTab='memory' />);
    expect(screen.getByText('release')).toBeInTheDocument();
    expect(screen.getByText('recording')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the skills tab', async () => {
    registry.skills = { retouch: tool };
    const { container } = render(<AdminSystemMap activeTab='skills' />);
    expect(screen.getByTestId('system-map-skills')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
