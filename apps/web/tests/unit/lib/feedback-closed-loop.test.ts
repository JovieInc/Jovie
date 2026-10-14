import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReturning = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());
const mockWhereSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockWhereUpdate = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const insertedValues = vi.hoisted(() => [] as unknown[][]);
const updateSets = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

const ctx = {
  pathname: '/app',
  userAgent: 'test-agent',
  timestampIso: new Date().toISOString(),
};

describe('createFeedbackItem closed-loop routing (JOV-6433)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    insertedValues.length = 0;
    updateSets.length = 0;

    mockReturning.mockResolvedValue([{ id: 'feedback_1' }]);
    mockValues.mockImplementation((v: unknown) => {
      insertedValues.push(Array.isArray(v) ? v : [v]);
      return { returning: mockReturning };
    });
    mockInsert.mockReturnValue({ values: mockValues });
    mockLimit.mockResolvedValue([{ id: 'feedback_1' }]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhereSelect.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockWhereUpdate.mockImplementation(() => {
      updateSets.push(mockSet.mock.calls.at(-1)?.[0]);
      return { returning: mockReturning };
    });
    mockSet.mockReturnValue({ where: mockWhereUpdate });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  async function create(message: string, context = ctx) {
    const { createFeedbackItem } = await import('@/lib/feedback');
    return createFeedbackItem({ userId: 'user_1', message, context });
  }

  it('persists classification + fingerprint on insert', async () => {
    await create('The publish button crashes every time');
    const itemInsert = insertedValues[0]?.[0] as Record<string, unknown>;
    expect(itemInsert.classification).toBe('bug_verifiable');
    expect(typeof itemInsert.fingerprint).toBe('string');
  });

  it('routes a new verifiable bug to auto_remediation with auto_ship_bug', async () => {
    await create('The publish button crashes every time');
    const decisions = insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toEqual([
      'classified',
      'auto_ship_bug',
    ]);
    expect(updateSets[0]).toMatchObject({ disposition: 'auto_remediation' });
  });

  it('keeps the earliest matching row canonical when concurrent reports are visible', async () => {
    mockLimit.mockResolvedValue([{ id: 'feedback_1' }]);
    await create('The publish button crashes every time');
    const decisions = insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toEqual([
      'classified',
      'auto_ship_bug',
    ]);
    expect(updateSets[0]).toMatchObject({ disposition: 'auto_remediation' });
    expect(mockOrderBy).toHaveBeenCalledOnce();
  });

  it('dedupes identical fingerprints into one canonical case', async () => {
    mockLimit.mockResolvedValue([{ id: 'canonical_1' }]);
    await create('The publish button crashes every time');
    const decisions = insertedValues[1] as {
      decision: string;
      feedbackItemId: string;
      payload: Record<string, unknown>;
    }[];
    const kinds = decisions.map(d => d.decision);
    expect(kinds).toContain('duplicate_of');
    expect(kinds).toContain('duplicate_observed');
    // Occurrence is recorded on the canonical case, not a new customer.
    expect(
      decisions.find(d => d.decision === 'duplicate_observed')?.feedbackItemId
    ).toBe('canonical_1');
    expect(updateSets[0]).toMatchObject({ disposition: 'duplicate' });
  });

  it('emits a summer_signal for feature requests', async () => {
    await create('Please add CSV export to analytics');
    const decisions = insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toEqual([
      'classified',
      'summer_signal',
    ]);
    expect(updateSets[0]).toMatchObject({ disposition: 'pending_summer' });
  });

  it('gates taste-bearing changes behind cert_required', async () => {
    await create('Please change the font on public profiles');
    const decisions = insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toContain('taste_cert_required');
    expect(updateSets[0]).toMatchObject({ disposition: 'cert_required' });
  });

  it('auto-disposes noise as never', async () => {
    await create('ok');
    const decisions = insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toEqual(['classified', 'noise']);
    expect(updateSets[0]).toMatchObject({ disposition: 'never' });
  });

  it('leaves non-feedback sources unclassified with no ledger writes', async () => {
    const { createFeedbackItem } = await import('@/lib/feedback');
    await createFeedbackItem({
      userId: 'user_1',
      message: 'abuse report payload',
      source: 'abuse_report',
      context: ctx,
    });
    const itemInsert = insertedValues[0]?.[0] as Record<string, unknown>;
    expect(itemInsert.classification).toBeNull();
    expect(itemInsert.fingerprint).toBeNull();
    expect(insertedValues).toHaveLength(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('keeps capture durable when routing fails', async () => {
    mockWhereSelect.mockImplementation(() => {
      throw new Error('dedupe lookup failed');
    });
    const item = await create('The publish button crashes every time');
    expect(item).toEqual({ id: 'feedback_1' });
    // No ledger rows written → disposition stays pending.
    expect(insertedValues).toHaveLength(1);
  });
});

describe('recordFeedbackDisposition', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    insertedValues.length = 0;

    mockReturning.mockResolvedValue([{ id: 'feedback_1' }]);
    mockValues.mockImplementation((v: unknown) => {
      insertedValues.push(Array.isArray(v) ? v : [v]);
      return { returning: mockReturning };
    });
    mockInsert.mockReturnValue({ values: mockValues });
    mockWhereUpdate.mockReturnValue({ returning: mockReturning });
    mockSet.mockReturnValue({ where: mockWhereUpdate });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it('writes the ledger row before updating disposition', async () => {
    const { recordFeedbackDisposition } = await import('@/lib/feedback');
    const result = await recordFeedbackDisposition({
      feedbackItemId: 'feedback_1',
      disposition: 'later',
      reason: 'below current bottleneck',
      actor: 'summer',
    });
    expect(result).toEqual({ id: 'feedback_1' });
    expect(insertedValues[0]?.[0]).toMatchObject({
      decision: 'later',
      reason: 'below current bottleneck',
      actor: 'summer',
    });
  });
});
