import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let tempRoot = '';

vi.mock('@/lib/agent-os/design-lab/paths', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/agent-os/design-lab/paths')
  >('@/lib/agent-os/design-lab/paths');

  return {
    ...actual,
    getDesignTasteMemoryPath: () =>
      path.join(tempRoot, 'agentos', 'memory', 'design-taste.md'),
  };
});

describe('appendDesignTasteMemoryEntry', () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'design-taste-'));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('creates taste memory file with formatted entry', async () => {
    const { appendDesignTasteMemoryEntry } = await import(
      '@/lib/agent-os/design-lab/taste-memory'
    );

    await appendDesignTasteMemoryEntry({
      timestamp: '2026-06-08T12:00:00.000Z',
      surfaceId: 'profile-page',
      surfaceName: 'Public profile page',
      direction: 'Use a restrained surface-1 header band.',
      decision: 'rejected',
      notes: 'Too loud for our restrained aesthetic.',
      reviewer: 'tim@jovie.com',
      linearIssueId: 'JOV-1951',
    });

    const content = await readFile(
      path.join(tempRoot, 'agentos', 'memory', 'design-taste.md'),
      'utf8'
    );

    expect(content).toContain('profile-page');
    expect(content).toContain('rejected');
    expect(content).toContain('Too loud for our restrained aesthetic.');
  });
});
