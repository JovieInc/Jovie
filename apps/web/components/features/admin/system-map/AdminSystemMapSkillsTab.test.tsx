import { promises as fs } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHITE_SPACE_STYLE_PROMPT } from '@/lib/services/retouching/style';

vi.mock('@/lib/agents/registry', () => ({
  SKILL_REGISTRY: {
    retouch: {
      id: 'retouch',
      name: 'Retouch',
      description: 'Image retouching',
      kind: 'tool',
      version: '1',
      model: 'test/model',
      promptPath: 'apps/web/lib/services/retouching/styles/white-space.md',
    },
    unknown: {
      id: 'unknown',
      name: 'Unknown prompt',
      description: 'Metadata only',
      kind: 'tool',
      version: '1',
      model: 'test/model',
      promptPath: 'unknown.md',
    },
    absent: {
      id: 'absent',
      name: 'No prompt',
      description: 'Metadata only',
      kind: 'tool',
      version: '1',
      model: 'test/model',
    },
  },
}));
vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => (
    <pre data-testid='prompt-doc'>{content}</pre>
  ),
}));

const { AdminSystemMapSkillsTab } = await import('./AdminSystemMapSkillsTab');

describe('AdminSystemMapSkillsTab packaged prompts', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(
      new Error('runtime markdown is not packaged')
    );
  });
  afterEach(() => vi.restoreAllMocks());
  it('discloses the complete canonical retouch prompt without runtime filesystem access', async () => {
    const user = userEvent.setup();
    render(await AdminSystemMapSkillsTab());
    await user.click(screen.getByRole('button', { name: /Retouch/i }));
    expect(screen.getByTestId('prompt-doc').textContent).toBe(
      WHITE_SPACE_STYLE_PROMPT
    );
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('keeps unknown and absent prompt documents unavailable while retaining skill metadata', async () => {
    const user = userEvent.setup();
    render(await AdminSystemMapSkillsTab());
    await user.click(screen.getByRole('button', { name: /Unknown prompt/i }));
    await user.click(screen.getByRole('button', { name: /No prompt/i }));
    expect(screen.getAllByText('No prompt doc for this skill.')).toHaveLength(
      2
    );
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
