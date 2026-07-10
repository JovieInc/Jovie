/**
 * sync-skills-catalog idempotency tests.
 *
 * Validates the shape and idempotency invariant of the catalog sync
 * without requiring a live DB connection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import type { SkillDefinition, ToolDefinition } from '@/lib/agents/types';
import { main, syncSkillsCatalog } from './sync-skills-catalog';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockInsert,
  mockOnConflictDoUpdate,
  mockOnConflictDoNothing,
  mockValues,
} = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({
    onConflictDoUpdate,
    onConflictDoNothing,
  });
  const insert = vi.fn().mockReturnValue({
    values,
  });

  return {
    mockInsert: insert,
    mockOnConflictDoUpdate: onConflictDoUpdate,
    mockOnConflictDoNothing: onConflictDoNothing,
    mockValues: values,
  };
});

const mockDb = { insert: mockInsert } as unknown as Parameters<
  typeof syncSkillsCatalog
>[0];

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

  it('v1 registry includes the chat-first pitch tool', () => {
    const pitchTool = SKILL_REGISTRY.generateReleasePitch as ToolDefinition;

    expect(pitchTool).toEqual(
      expect.objectContaining({
        id: 'generateReleasePitch',
        kind: 'tool',
        entitlement: 'aiCanUseTools',
        inputSchemaZodPath: 'apps/web/lib/chat/tool-schemas.ts',
        outputSchemaZodPath: 'apps/web/components/jovie/tool-ui.tsx',
      })
    );
  });

  it('upserts non-tool skills with conflict guards', async () => {
    await syncSkillsCatalog(mockDb);

    expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(1);
    const insertedRows = mockValues.mock.calls[0]?.[0] as
      | Array<Record<string, unknown>>
      | undefined;

    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retouch',
          kind: 'vertical_agent',
          entitlementRequired: 'canAccessAiRetouching',
          lifecycle: 'ga',
          activeVersion: '1.0.0',
          version: '1.0.0',
        }),
      ])
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        setWhere: expect.anything(),
        set: expect.objectContaining({
          lifecycle: expect.anything(),
          activeVersion: expect.anything(),
        }),
      })
    );
  });

  it('writes version history rows with onConflictDoNothing semantics', async () => {
    await syncSkillsCatalog(mockDb);

    // non-tool skills catalog insert + versions insert + tools insert
    expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(2);
    const versionRowsCall = mockValues.mock.calls.find(([rows]) => {
      return (
        Array.isArray(rows) &&
        rows.some(
          row =>
            (row as { skillId?: string }).skillId === 'retouch' &&
            (row as { version?: string }).version === '1.0.0'
        )
      );
    });
    expect(versionRowsCall).toBeDefined();
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it('upserts tool schema paths with conflict guards', async () => {
    mutableRegistry.unitTool = {
      id: 'unitTool',
      name: 'Unit tool',
      description: 'Tool catalog test entry',
      kind: 'tool',
      version: '1.0.0',
      entitlement: 'canAccessAiRetouching',
      model: 'unit-model',
      inputSchemaZodPath: 'apps/web/lib/agents/tools/unit/input.ts',
      outputSchemaZodPath: 'apps/web/lib/agents/tools/unit/output.ts',
      metadata: { surface: 'unit' },
    };

    await syncSkillsCatalog(mockDb);

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
    // Version history insert uses onConflictDoNothing, so values-call index
    // no longer lines up with onConflictDoUpdate calls — match by payload.
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
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

  it('skips DB writes when SKIP_SKILLS_CATALOG_SYNC is enabled', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SKIP_SKILLS_CATALOG_SYNC', '1');

    await expect(main()).resolves.toBe('skipped');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips DB writes for the screenshot workflow placeholder DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/noop');

    await expect(main()).resolves.toBe('skipped');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips deploy-time sync when catalog tables are not migrated yet', async () => {
    const missingTableError = {
      cause: {
        code: '42P01',
        message: 'relation "skills_catalog" does not exist',
      },
    };

    await expect(
      main(async () => {
        throw missingTableError;
      })
    ).resolves.toBe('skipped');
  });
});
