import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelectMock },
}));

import {
  isHoldoutSession,
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
  lineKey: 'done:cand_ab12cd34',
  stepId: 'done',
  variant: 'cand_ab12cd34',
  text: 'The card above is your next move — take it when you are ready.',
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
    expect(bank.get('done')).toHaveLength(linesForStep('done').length + 1);
    // Weight 100000 vs seed 100 → any session lands on the promoted line.
    const line = pickFromBank(bank, 'done', 'any-session');
    expect(line.key).toBe('done:cand_ab12cd34');
    expect(line.text).toContain('card above');
    // Mechanical copy-floor repair applies to promoted text (no em dash).
    expect(line.text).not.toContain('—');
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

  it('holdout sessions never serve promoted lines (JOV-7148)', async () => {
    mockActiveRows([PROMOTED_ROW]);
    const bank = await loadScriptBank();
    const holdoutSessions: string[] = [];
    const treatmentSessions: string[] = [];
    for (
      let i = 0;
      i < 2000 && (holdoutSessions.length < 3 || treatmentSessions.length < 3);
      i += 1
    ) {
      const sessionId = `sess-${i}`;
      (isHoldoutSession(sessionId) ? holdoutSessions : treatmentSessions).push(
        sessionId
      );
    }
    expect(holdoutSessions.length).toBeGreaterThan(0);
    for (const sessionId of holdoutSessions) {
      const line = pickFromBank(bank, 'done', sessionId);
      expect(line.key).not.toBe('done:cand_ab12cd34');
      expect(line.stepId).toBe('done');
    }
    // Treatment sessions still see the promoted line (weight dominates).
    const treated = pickFromBank(bank, 'done', treatmentSessions[0] ?? 's');
    expect(treated.key).toBe('done:cand_ab12cd34');
  });

  it('never serves promoted copy for steps that describe a card (2026-10-31 walk)', async () => {
    mockActiveRows([
      {
        ...PROMOTED_ROW,
        stepId: 'waitlist',
        lineKey: 'waitlist:v1',
        text: 'Putting you on the early list. I will ping you when you are up.',
      },
    ]);
    const bank = await loadScriptBank();
    expect(bank.get('waitlist')).toHaveLength(linesForStep('waitlist').length);
  });

  it("drops promoted rows that fail today's copy floor", async () => {
    mockActiveRows([
      {
        ...PROMOTED_ROW,
        stepId: 'handle',
        lineKey: 'handle:cand_jargon',
        text: 'Checking @{handle}. 97 Spotify followers (source: enrichment).',
      },
    ]);
    const bank = await loadScriptBank();
    expect(bank.get('handle')).toHaveLength(linesForStep('handle').length);
  });

  it('ignores rows with unknown step ids', async () => {
    mockActiveRows([
      { ...PROMOTED_ROW, stepId: 'not_a_step', lineKey: 'not_a_step:v1' },
    ]);
    const bank = await loadScriptBank();
    const line = pickFromBank(bank, 'done', 'any-session');
    expect(line.stepId).toBe('done');
  });
});

describe('pickFromBank segment gate (JOV-9679)', () => {
  it('never serves a music-scoped line to a comedian', async () => {
    resetScriptBankCache();
    mockActiveRows([]);
    const bank = await loadScriptBank();
    for (let i = 0; i < 40; i++) {
      for (const step of ['faq_what', 'clarify'] as const) {
        const picked = pickFromBank(bank, step, `session-${i}`, 'comedian');
        expect(picked.segments).toBe('neutral');
      }
    }
  });

  it('keeps legacy lines when no segment is resolved', async () => {
    resetScriptBankCache();
    mockActiveRows([]);
    const bank = await loadScriptBank();
    const keys = new Set<string>();
    for (let i = 0; i < 60; i++) {
      keys.add(pickFromBank(bank, 'faq_what', `s-${i}`).key);
    }
    expect(keys.has('faq_what:v1')).toBe(true);
  });
});
