import { describe, expect, it } from 'vitest';
import {
  cronExpressions,
  cronGapMinutes,
  cronMinutesOfDay,
  filterList,
  triggerNames,
  workflowTriggers,
} from '../workflow-triggers.mjs';

describe('workflowTriggers', () => {
  it('normalizes the map form and ignores comments and key order', () => {
    const on = workflowTriggers(`name: x
# pull_request: mentioned only in a comment
on:
  workflow_dispatch:
  push:
    branches: [main]
  schedule:
    - cron: '17 * * * *'
jobs: {}
`);
    expect(triggerNames(on)).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(on.workflow_dispatch).toEqual({});
    expect(filterList(on.push.branches)).toEqual(['main']);
    expect(cronExpressions(on)).toEqual(['17 * * * *']);
  });

  it('normalizes the string and list forms', () => {
    expect(workflowTriggers('on: push\njobs: {}\n')).toEqual({ push: {} });
    expect(
      triggerNames(
        workflowTriggers('on: [push, workflow_dispatch]\njobs: {}\n')
      )
    ).toEqual(['push', 'workflow_dispatch']);
  });

  it('rejects documents without an on: block', () => {
    expect(() => workflowTriggers('jobs: {}\n')).toThrow('no on: block');
    expect(() => workflowTriggers('just text')).toThrow('not a map');
  });
});

describe('cron cadence', () => {
  it('expands steps, ranges and lists over a day', () => {
    expect(cronMinutesOfDay('*/20 3 * * *')).toEqual([180, 200, 220]);
    expect(cronMinutesOfDay('5,35 0-1 * * 1')).toEqual([5, 35, 65, 95]);
    expect(cronMinutesOfDay('10/30 0 * * *')).toEqual([10, 40]);
  });

  it('reports the shortest and longest gaps across schedule entries', () => {
    const hourly = workflowTriggers(
      "on:\n  schedule:\n    - cron: '17 * * * *'\njobs: {}\n"
    );
    expect(cronGapMinutes(hourly)).toEqual({ min: 60, max: 60 });
    const twice = workflowTriggers(
      "on:\n  schedule:\n    - cron: '0 4 * * *'\n    - cron: '30 4 * * *'\njobs: {}\n"
    );
    expect(cronGapMinutes(twice)).toEqual({ min: 30, max: 1410 });
    expect(cronGapMinutes(workflowTriggers('on: push\njobs: {}\n'))).toEqual({
      min: Number.POSITIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
    });
  });

  it('fails closed on cron syntax it cannot model', () => {
    expect(() => cronMinutesOfDay('* * *')).toThrow('5 fields');
    expect(() => cronMinutesOfDay('L 0 * * *')).toThrow('unsupported');
    expect(() => cronMinutesOfDay('70 0 * * *')).toThrow('unsupported');
    expect(() => cronMinutesOfDay('*/0 0 * * *')).toThrow('unsupported');
  });

  it('normalizes scalar and missing filters', () => {
    expect(filterList('main')).toEqual(['main']);
    expect(filterList(undefined)).toEqual([]);
    expect(filterList(['b', 'a'])).toEqual(['a', 'b']);
  });
});
