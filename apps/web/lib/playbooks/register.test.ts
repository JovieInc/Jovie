import { describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/lib/agents/types';

const database = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: database }));

import { registerCompiledSkill } from './register';

describe('preparation catalog boundary', () => {
  it.each<Pick<SkillDefinition, 'id' | 'metadata'>>([
    { id: 'growth-presence-repair-offer', metadata: {} },
    { id: 'renamed-draft', metadata: { growthGovernance: '{}' } },
  ])(
    'rejects $id before any catalog write or existing-version lookup',
    async candidate => {
      const skill: SkillDefinition = {
        ...candidate,
        name: 'Private preparation',
        description: 'Blocked draft',
        kind: 'vertical_agent',
        version: '0.1.0',
        lifecycle: 'draft',
        entitlement: 'aiCanUseTools',
        model: 'unused',
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(registerCompiledSkill(skill)).rejects.toThrow(
          'not registrable'
        );
      }
      expect(database.insert).not.toHaveBeenCalled();
      expect(database.select).not.toHaveBeenCalled();
      expect(database.update).not.toHaveBeenCalled();
    }
  );
});
