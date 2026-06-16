import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  engineNeedsPoolBudget,
  formatShellExports,
  planPoolBudget,
  resolvePoolBudgetEnv,
  SUPABASE_POOL_BUDGET_DEFAULTS,
  shellQuote,
} from '../gbrain-pool-env.mjs';

describe('engineNeedsPoolBudget', () => {
  it('skips PGLite engines', () => {
    expect(engineNeedsPoolBudget({ engine: 'pglite' })).toBe(false);
  });

  it('applies to postgres/supabase engines', () => {
    expect(engineNeedsPoolBudget({ engine: 'postgres' })).toBe(true);
    expect(engineNeedsPoolBudget({ engine: 'supabase' })).toBe(true);
  });

  it('detects Supabase hosts even when engine is unset', () => {
    expect(
      engineNeedsPoolBudget({
        database_url: 'host=pooler.supabase.com:6543',
      })
    ).toBe(true);
  });
});

describe('resolvePoolBudgetEnv', () => {
  it('fills missing keys from defaults', () => {
    expect(resolvePoolBudgetEnv({})).toEqual(SUPABASE_POOL_BUDGET_DEFAULTS);
  });

  it('preserves operator overrides', () => {
    expect(
      resolvePoolBudgetEnv({
        GBRAIN_POOL_SIZE: '3',
        GBRAIN_MAX_CONNECTIONS: '20',
      })
    ).toEqual({
      ...SUPABASE_POOL_BUDGET_DEFAULTS,
      GBRAIN_POOL_SIZE: '3',
      GBRAIN_MAX_CONNECTIONS: '20',
    });
  });
});

describe('planPoolBudget', () => {
  it('returns no-op for PGLite config files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-pool-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ engine: 'pglite' }));

    expect(planPoolBudget(configPath, {})).toEqual({
      apply: false,
      env: {},
      reason: 'engine-skip',
    });
  });

  it('returns clamp env for Supabase configs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-pool-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        engine: 'postgres',
        database_url: 'host=pooler.supabase.com:6543',
      })
    );

    expect(planPoolBudget(configPath, {})).toEqual({
      apply: true,
      env: SUPABASE_POOL_BUDGET_DEFAULTS,
      reason: 'supabase-pool-budget',
    });
  });

  it('honors GBRAIN_POOL_BUDGET_DISABLED', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-pool-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ engine: 'postgres' }));

    expect(
      planPoolBudget(configPath, { GBRAIN_POOL_BUDGET_DISABLED: '1' })
    ).toEqual({
      apply: false,
      env: {},
      reason: 'disabled',
    });
  });
});

describe('formatShellExports', () => {
  it('emits safe export statements', () => {
    const output = formatShellExports({
      GBRAIN_POOL_SIZE: '2',
      GBRAIN_NOTE: 'has space',
    });
    expect(output).toContain('export GBRAIN_POOL_SIZE=2');
    expect(output).toContain("export GBRAIN_NOTE='has space'");
  });

  it('quotes values with shell metacharacters', () => {
    expect(shellQuote('a;b')).toBe(`'a;b'`);
  });
});
