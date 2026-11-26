import { describe, expect, it } from 'vitest';
import { defaultOptionsPropertyRepair } from '../../typecheck-scripts.mjs';

describe('scripts-typecheck: default options property repair', () => {
  it('identifies missing properties on inferred optional options without matching other types', () => {
    expect(
      defaultOptionsPropertyRepair([
        "scripts/hook.mjs(44,32): error TS2339: Property 'token' does not exist on type '{ method?: string; }'.",
      ])
    ).toContain('JSDoc');
    expect(
      defaultOptionsPropertyRepair([
        "scripts/hook.mjs(44,32): error TS2339: Property 'token' does not exist on type 'Response'.",
      ])
    ).toBeNull();
    expect(defaultOptionsPropertyRepair([])).toBeNull();
  });
});
