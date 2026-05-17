/**
 * sync-skills-catalog idempotency tests.
 *
 * Validates the shape and idempotency invariant of the catalog sync
 * without requiring a live DB connection. Uses a vi.mock for `@/lib/db`
 * so the test runs in unit context.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import type { SkillDefinition, ToolDefinition } from '@/lib/agents/types';
import { main, syncSkillsCatalog } from './sync-skills-catalog';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockInsert, mockOnConflictDoUpdate, mockValues } = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({
    onConflictDoUpdate,
  });
  const insert = vi.fn().mockReturnValue({
    values,
  });

  return {
    mockInsert: insert,
    mockOnConflictDoUpdate: onConflictDoUpdate,
    mockValues: values,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync-skills-catalog', () => {
  const mutableRegistry = SKILL_REGISTRY as unknown as Record<
    string,
    SkillDefinition | ToolDefinition
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'postgres://unit-test');
    delete mutableRegistry.unitTool;
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

  it('upserts non-tool skills with conflict guards', async () => {
    await syncSkillsCatalog();

    expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(1);
    const insertedRows = mockValues.mock.calls[0]?.[0] as
      | Array<Record<string, unknown>>
      | undefined;

    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retouch',
          kind: 'vertical_agent',
          entitlementRequired: 'ai_retouching',
        }),
      ])
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        setWhere: expect.anything(),
      })
    );
  });

  it('upserts tool schema paths with conflict guards', async () => {
    mutableRegistry.unitTool = {
      id: 'unitTool',
      name: 'Unit tool',
      description: 'Tool catalog test entry',
      kind: 'tool',
      version: '1.0.0',
      entitlement: 'ai_retouching',
      model: 'unit-model',
      inputSchemaZodPath: 'apps/web/lib/agents/tools/unit/input.ts',
      outputSchemaZodPath: 'apps/web/lib/agents/tools/unit/output.ts',
      metadata: { surface: 'unit' },
    };

    await syncSkillsCatalog();

    expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(2);
    const toolCallIndex = mockValues.mock.calls.findIndex(([rows]) => {
      return (
        Array.isArray(rows) &&
        rows.some(row => (row as { id?: string }).id === 'unitTool')
      );
    });
    expect(toolCallIndex).toBeGreaterThanOrEqual(0);
    const toolRows = mockValues.mock.calls[toolCallIndex]?.[0] as
      | Array<Record<string, unknown>>
      | undefined;

    expect(toolRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'unitTool',
          kind: 'tool',
          inputSchemaZodPath: 'apps/web/lib/agents/tools/unit/input.ts',
          outputSchemaZodPath: 'apps/web/lib/agents/tools/unit/output.ts',
        }),
      ])
    );
    expect(mockOnConflictDoUpdate.mock.calls[toolCallIndex]?.[0]).toEqual(
      expect.objectContaining({
        set: expect.objectContaining({
          inputSchemaZodPath: expect.anything(),
          outputSchemaZodPath: expect.anything(),
        }),
        setWhere: expect.anything(),
      })
    );
  });

  it('skips DB writes when DATABASE_URL is unavailable', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(main()).resolves.toBe('skipped');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
