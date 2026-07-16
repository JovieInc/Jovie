import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCompanyControllerState,
  planCompanyControllerTick,
  readCompanyControllerState,
  writeCompanyControllerState,
} from '../../hermes/lib/company-controller.ts';
import { tryWithHeavyJobLock } from '../../hermes/lib/heavy-job-lock.ts';

const cleanups = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop(), { recursive: true, force: true });
});
function issue(number, title, labels = [], updatedAt = '2026-07-16T12:00:00.000Z') {
  return {
    number,
    title,
    body: '',
    url: `https://github.com/JovieInc/Jovie/issues/${number}`,
    updatedAt,
    labels: labels.map(name => ({ name })),
  };
}

function reflectActions(issues, actions) {
  const byNumber = new Map(issues.map(value => [value.number, value]));
  for (const action of actions) {
    const current = byNumber.get(action.issue);
    const labels = new Set(current.labels.map(label => label.name));
    action.addLabels.forEach(label => labels.add(label));
    action.removeLabels.forEach(label => labels.delete(label));
    byNumber.set(action.issue, {
      ...current,
      labels: [...labels].map(name => ({ name })),
    });
  }
  return [...byNumber.values()];
}

describe('Summer company controller', () => {
  it('chooses the leftmost revenue constraint and enforces one packet per lane', () => {
    const now = new Date('2026-07-16T13:00:00.000Z');
    const plan = planCompanyControllerTick({
      state: createCompanyControllerState(now),
      now,
      issues: [
        issue(10, 'Improve homepage SEO', ['marketing']),
        issue(11, 'Repair signup redirect', ['auth']),
        issue(12, 'Checkout outage', ['billing', 'p0']),
        issue(13, 'CI runner failure', ['ci', 'p0']),
      ],
    });

    expect(plan.state.constraint?.issue).toBe(12);
    expect(plan.actions.map(action => action.issue).sort()).toEqual([12, 13]);
    expect(plan.state.lanes.revenue.packetIds).toHaveLength(1);
    expect(plan.state.lanes.delivery.packetIds).toHaveLength(1);
  });

  it('is idempotent, then releases an unclaimed packet after its lease', () => {
    const start = new Date('2026-07-16T00:00:00.000Z');
    const issues = [issue(20, 'Fix signup', ['auth'], start.toISOString())];
    const first = planCompanyControllerTick({
      state: createCompanyControllerState(start),
      now: start,
      issues,
      leaseMs: 60 * 60 * 1000,
    });
    const admitted = reflectActions(issues, first.actions);
    const stable = planCompanyControllerTick({
      state: first.state,
      now: new Date('2026-07-16T00:15:00.000Z'),
      issues: admitted,
      leaseMs: 60 * 60 * 1000,
    });
    const expired = planCompanyControllerTick({
      state: first.state,
      now: new Date('2026-07-16T02:00:00.000Z'),
      issues: admitted,
      leaseMs: 60 * 60 * 1000,
    });

    expect(stable.actions).toEqual([]);
    expect(stable.material).toBe(false);
    expect(expired.actions[0]?.type).toBe('release');
    expect(expired.state.packets['github:20']).toBe(undefined);
  });

  it('atomically persists state and excludes a concurrent tick', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'company-controller-'));
    cleanups.push(dir);
    const statePath = join(dir, 'state.json');
    const lockPath = join(dir, 'controller.lock');
    const state = createCompanyControllerState(new Date('2026-07-16T00:00:00Z'));
    writeCompanyControllerState(statePath, state);
    const locked = await tryWithHeavyJobLock(
      'outer',
      () => tryWithHeavyJobLock('inner', async () => 'double-owned', { lockPath, staleMs: 60_000 }),
      { lockPath, staleMs: 60_000 }
    );

    expect(readCompanyControllerState(statePath)).toEqual(state);
    expect(() => readFileSync(`${statePath}.${process.pid}.tmp`)).toThrow();
    expect(locked.acquired).toBe(true);
    expect(locked.value.acquired).toBe(false);
  });
});
