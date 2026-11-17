import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const dbMock = vi.hoisted(() => {
  const state = {
    selectRows: [] as Row[],
    returningRows: [] as Row[],
    inserts: [] as Array<{ values: Row; conflict: Record<string, unknown> }>,
  };
  const db = {
    select: () => {
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(state.selectRows),
      };
      return chain;
    },
    insert: () => {
      const entry = { values: {} as Row, conflict: {} };
      const chain = {
        values: (values: Row) => {
          entry.values = values;
          return chain;
        },
        onConflictDoUpdate: (conflict: Record<string, unknown>) => {
          entry.conflict = conflict;
          state.inserts.push(entry);
          return chain;
        },
        returning: () => Promise.resolve(state.returningRows),
      };
      return chain;
    },
  };
  return { state, db };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: dbMock.db }));

import { pmfSurveyResponses } from '@/lib/db/schema/pmf-survey';
import {
  isPmfSurveyEligibleForUser,
  normalizeMainBenefit,
  recordPmfSurveyAnswer,
  recordPmfSurveyDismissal,
} from './store.server';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const USER_ID = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  dbMock.state.selectRows = [];
  dbMock.state.returningRows = [{ id: 'row-1' }];
  dbMock.state.inserts = [];
});

describe('recordPmfSurveyAnswer', () => {
  it('stores the answer, trimmed benefit and answer time for the user', async () => {
    const result = await recordPmfSurveyAnswer({
      userId: USER_ID,
      response: 'very_disappointed',
      mainBenefit: '  One link for every release  ',
      now: NOW,
    });

    expect(result).toEqual({ stored: true });
    const [insert] = dbMock.state.inserts;
    expect(insert.values).toMatchObject({
      userId: USER_ID,
      response: 'very_disappointed',
      mainBenefit: 'One link for every release',
      answeredAt: NOW,
    });
    expect(insert.conflict.target).toBe(pmfSurveyResponses.userId);
    expect(insert.conflict.set).toMatchObject({
      response: 'very_disappointed',
      answeredAt: NOW,
    });
    // An existing answer is never overwritten.
    expect(insert.conflict.setWhere).toBeDefined();
  });

  it('reports not stored when the user had already answered', async () => {
    dbMock.state.returningRows = [];
    const result = await recordPmfSurveyAnswer({
      userId: USER_ID,
      response: 'not_disappointed',
      mainBenefit: null,
      now: NOW,
    });
    expect(result).toEqual({ stored: false });
    expect(dbMock.state.inserts[0].values.mainBenefit).toBeNull();
  });
});

describe('recordPmfSurveyDismissal', () => {
  it('counts the first dismissal and stamps its time', async () => {
    const result = await recordPmfSurveyDismissal({
      userId: USER_ID,
      now: NOW,
    });
    expect(result).toEqual({ stored: true });
    const [insert] = dbMock.state.inserts;
    expect(insert.values).toMatchObject({
      userId: USER_ID,
      dismissCount: 1,
      lastDismissedAt: NOW,
    });
    expect(insert.conflict.set).toMatchObject({ lastDismissedAt: NOW });
    expect(insert.conflict.setWhere).toBeDefined();
  });
});

describe('isPmfSurveyEligibleForUser', () => {
  it('is false for an unknown or deleted user', async () => {
    await expect(
      isPmfSurveyEligibleForUser({ userId: USER_ID, now: NOW })
    ).resolves.toBe(false);
  });

  it('is false for an admitted user who has not activated', async () => {
    dbMock.state.selectRows = [
      { userStatus: 'onboarding_incomplete', activated: false, surveyId: null },
    ];
    await expect(
      isPmfSurveyEligibleForUser({ userId: USER_ID, now: NOW })
    ).resolves.toBe(false);
  });

  it('is false for a waitlisted user even with a finished profile', async () => {
    dbMock.state.selectRows = [
      { userStatus: 'waitlist_pending', activated: true, surveyId: null },
    ];
    await expect(
      isPmfSurveyEligibleForUser({ userId: USER_ID, now: NOW })
    ).resolves.toBe(false);
  });

  it('is true for an activated user with no survey row', async () => {
    dbMock.state.selectRows = [
      { userStatus: 'active', activated: true, surveyId: null },
    ];
    await expect(
      isPmfSurveyEligibleForUser({ userId: USER_ID, now: NOW })
    ).resolves.toBe(true);
  });

  it('reads the stored dismissal history', async () => {
    dbMock.state.selectRows = [
      {
        userStatus: 'active',
        activated: true,
        surveyId: 'row-1',
        answeredAt: null,
        dismissCount: 1,
        lastDismissedAt: new Date('2026-11-01T12:00:00.000Z'),
      },
    ];
    await expect(
      isPmfSurveyEligibleForUser({ userId: USER_ID, now: NOW })
    ).resolves.toBe(false);
    await expect(
      isPmfSurveyEligibleForUser({
        userId: USER_ID,
        now: new Date('2026-11-15T12:00:00.000Z'),
      })
    ).resolves.toBe(true);
  });
});

describe('normalizeMainBenefit', () => {
  it('drops blank text and caps length', () => {
    expect(normalizeMainBenefit('   ')).toBeNull();
    expect(normalizeMainBenefit(null)).toBeNull();
    expect(normalizeMainBenefit('x'.repeat(1200))).toHaveLength(1000);
  });
});
