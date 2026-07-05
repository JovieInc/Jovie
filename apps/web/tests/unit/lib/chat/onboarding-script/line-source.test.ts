import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelectMock },
}));

import {
  loadScriptBank,
  pickFromBank,
  resetScriptBankCache,
} from '@/lib/chat/onboarding-script/line-source';
import { linesForStep } from '@/lib/chat/onboarding-script/script';

function mockActiveRows(rows: readonly Record<string, unknown>[]) {
  hoisted.dbSelectMock.mockImplementation(() => ({
    from: () => ({
      where: vi.fn().mockResolvedValue(rows),
    }),
  }));
}

const PROMOTED_ROW = {
  id: 'row-1',
  lineKey: 'waitlist:cand_ab12cd34',
  stepId: 'waitlist',
  variant: 'cand_ab12cd34',
  text: 'Early list, real spots — you keep your place and we pick up right here.',
  source: 'promoted',
  status: 'active',
  weight: 100_000, // dominate the pick for the test
  impressions: 50,
  conversions: 30,
};

describe('loadScriptBank', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetScriptBankCache();
  });

  it('serves seeds when the DB read fails', async () => {
    hoisted.dbSelectMock.mockImplementation(() => {
      throw new Error('db down');
    });
    const bank = await loadScriptBank();
    expect(bank.get('greet')).toHaveLength(linesForStep('greet').length);
    const line = pickFromBank(bank, 'greet', 'session-1');
    expect(line.stepId).toBe('greet');
  });

  it('merges active promoted rows and serves them by weight', async () => {
    mockActiveRows([PROMOTED_ROW]);
    const bank = await loadScriptBank();
    expect(bank.get('waitlist')).toHaveLength(
      linesForStep('waitlist').length + 1
    );
    // Weight 100000 vs seed 100 → any session lands on the promoted line.
    const line = pickFromBank(bank, 'waitlist', 'any-session');
    expect(line.key).toBe('waitlist:cand_ab12cd34');
    expect(line.text).toContain('Early list');
  });

  it('applies DB weight to seed rows without overriding code text', async () => {
    const seed = linesForStep('greet')[0];
    if (!seed) throw new Error('no greet seed');
    mockActiveRows([
      {
        ...PROMOTED_ROW,
        lineKey: seed.key,
        stepId: 'greet',
        variant: seed.variant,
        text: 'STALE DB COPY THAT MUST NOT SERVE',
        source: 'seed',
        weight: 100_000,
      },
    ]);
    const bank = await loadScriptBank();
    const line = pickFromBank(bank, 'greet', 'any-session');
    expect(line.key).toBe(seed.key);
    expect(line.text).toBe(seed.text);
  });

  it('caches between calls', async () => {
    mockActiveRows([]);
    await loadScriptBank();
    await loadScriptBank();
    expect(hoisted.dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it('ignores rows with unknown step ids', async () => {
    mockActiveRows([
      { ...PROMOTED_ROW, stepId: 'not_a_step', lineKey: 'not_a_step:v1' },
    ]);
    const bank = await loadScriptBank();
    const line = pickFromBank(bank, 'waitlist', 'any-session');
    expect(line.stepId).toBe('waitlist');
  });
});
