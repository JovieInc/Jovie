import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => ({
  testSkill: {
    id: 'testSkill',
    name: 'Test Skill',
    description: 'A test skill',
    kind: 'vertical_agent',
    version: '1.0.0',
    model: 'test/model',
    metadata: {},
  },
  testTool: {
    id: 'testTool',
    name: 'Test Tool',
    description: 'A test tool',
    kind: 'tool',
    version: '1.0.0',
    model: 'test/model',
    metadata: {},
  },
}));

vi.mock('@/lib/agents/registry', () => ({ SKILL_REGISTRY: registry }));
vi.mock('@/lib/connectors/registry', () => ({
  getConnectorDefinitions: () => [
    { id: 'gmail', label: 'Gmail', description: 'Scan booking emails.' },
  ],
}));
vi.mock(
  '@/components/features/admin/system-map/AdminSystemMapSkillsTab',
  () => ({
    AdminSystemMapSkillsTab: () => (
      <div data-testid='skills-tab-probe'>Skills</div>
    ),
  })
);
vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const { AdminSystemMap } = await import(
  '@/components/features/admin/system-map/AdminSystemMap'
);
const { SkillDocCard } = await import(
  '@/components/features/admin/system-map/SkillDocCard'
);

describe('AdminSystemMap', () => {
  it('renders skills through the registry-owned skills surface', async () => {
    render(await AdminSystemMap({ activeTab: 'skills' }));
    expect(screen.getByTestId('skills-tab-probe')).toBeInTheDocument();
  });

  it('renders connector and tool entries as canonical content cards', async () => {
    const connectors = render(
      await AdminSystemMap({ activeTab: 'connectors' })
    );
    expect(
      screen.getByText('Gmail').closest('[class*="rounded-lg"]')
    ).toHaveClass('border-(--app-shell-border)');
    connectors.unmount();

    render(await AdminSystemMap({ activeTab: 'tools' }));
    expect(screen.getByText('Test Tool')).toBeInTheDocument();
    expect(screen.getByText('test/model')).toBeInTheDocument();
  });

  it('uses the canonical empty state when no tool entries are registered', async () => {
    const originalKind = registry.testTool.kind;
    registry.testTool.kind = 'vertical_agent';
    try {
      render(await AdminSystemMap({ activeTab: 'tools' }));
      expect(screen.getByTestId('system-map-tools-empty')).toHaveTextContent(
        'No tools registered.'
      );
    } finally {
      registry.testTool.kind = originalKind;
    }
  });

  it('keeps the memory entity inventory visible', async () => {
    render(await AdminSystemMap({ activeTab: 'memory' }));
    expect(screen.getByTestId('system-map-memory')).toHaveTextContent('artist');
    expect(screen.getByTestId('system-map-memory')).toHaveTextContent(
      'release'
    );
  });
});

describe('SkillDocCard', () => {
  it('discloses prompt content while preserving metadata', async () => {
    const user = userEvent.setup();
    render(
      <SkillDocCard
        id='testSkill'
        name='Test Skill'
        description='A test skill'
        kind='vertical_agent'
        model='test/model'
        version='1.0.0'
        promptContent='Prompt body'
      />
    );

    const trigger = screen.getByRole('button', { name: /Test Skill/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Prompt body')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-testSkill')).toHaveClass(
      'border-(--app-shell-border)'
    );
  });

  it('explains a missing prompt document after disclosure', async () => {
    const user = userEvent.setup();
    render(
      <SkillDocCard
        id='missingPrompt'
        name='Missing Prompt'
        description='Metadata remains available.'
        kind='tool'
        model='test/model'
        version='1.0.0'
        promptContent={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /Missing Prompt/i }));
    expect(
      screen.getByText('No prompt doc for this skill.')
    ).toBeInTheDocument();
  });
});
