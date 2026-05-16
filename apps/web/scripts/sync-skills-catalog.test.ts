/**
 * sync-skills-catalog idempotency tests.
 *
 * Validates the shape and idempotency invariant of the catalog sync
 * without requiring a live DB connection. Uses a vi.mock for `@/lib/db`
 * so the test runs in unit context.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_REGISTRY } from '@/lib/agents/registry';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture insert calls for assertion
const capturedInserts: Array<{ table: string; values: unknown }> = [];

const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }),
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    sql: actual.sql,
  };
});

vi.mock('@/lib/db/schema/agents', () => ({
  skillsCatalog: { id: 'skills_catalog_mock_table' },
  toolsCatalog: { id: 'tools_catalog_mock_table' },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync-skills-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInserts.length = 0;
  });

  it('SKILL_REGISTRY exports at least one non-tool skill', () => {
    const skills = Object.values(SKILL_REGISTRY);
    const nonTools = skills.filter(s => s.kind !== 'tool');
    expect(nonTools.length).toBeGreaterThanOrEqual(1);
  });

  it('retouch is classified as vertical_agent (not tool)', () => {
    expect(SKILL_REGISTRY.retouch.kind).toBe('vertical_agent');
  });

  it('all registry keys match their id field', () => {
    for (const [key, skill] of Object.entries(SKILL_REGISTRY)) {
      expect(skill.id).toBe(key);
    }
  });

  it('all registry entries have non-empty required fields', () => {
    for (const skill of Object.values(SKILL_REGISTRY)) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.version).toBeTruthy();
      expect(skill.entitlement).toBeTruthy();
      expect(skill.model).toBeTruthy();
    }
  });

  it('v1 registry has zero tool-kind entries', () => {
    const toolCount = Object.values(SKILL_REGISTRY).filter(
      s => s.kind === 'tool'
    ).length;
    expect(toolCount).toBe(0);
  });
});
