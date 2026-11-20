import { describe, expect, it } from 'vitest';
import { summarizeCapacity } from '../ci-capacity.mjs';

const t = s => new Date(Date.UTC(2026, 9, 29, 19, 0, s)).toISOString();
const job = (workflow, wait, run, extra = {}) => ({
  workflow,
  status: 'completed',
  conclusion: 'success',
  created_at: t(0),
  started_at: t(wait),
  completed_at: t(wait + run),
  labels: ['ubuntu-latest'],
  ...extra,
});

describe('summarizeCapacity', () => {
  const now = Date.parse(t(600));
  it('splits hosted from self-hosted and ignores skipped jobs', () => {
    const s = summarizeCapacity(
      [
        job('CI', 10, 60),
        job('CI', 200, 60),
        job('CI', 0, 0, { conclusion: 'skipped' }),
        job('PR Size Guard', 5, 30, { labels: ['self-hosted', 'Linux'] }),
      ],
      { now }
    );
    expect(s.hostedQueueSeconds.n).toBe(2);
    expect(s.hostedQueueSeconds.p95).toBe(200);
    expect(s.selfHostedQueueSeconds.n).toBe(1);
    expect(s.alarm.firing).toBe(true);
  });
  it('counts still-queued jobs as lower-bound waits', () => {
    const s = summarizeCapacity(
      [
        {
          workflow: 'CI',
          status: 'queued',
          created_at: t(0),
          started_at: null,
          labels: ['ubuntu-latest'],
        },
      ],
      { now }
    );
    expect(s.hostedQueueSeconds.max).toBe(600);
  });
  it('reports control-plane job-minutes per hour and no-ops', () => {
    const s = summarizeCapacity(
      [
        job('Lane Fix Relay', 1, 120, { noop: true }),
        job('Merge Queue Green Enroll', 1, 60),
        job('CI', 1, 600),
      ],
      { now, windowHours: 0.5 }
    );
    expect(s.controlPlane['Lane Fix Relay'].noopJobsPerHour).toBe(2);
    expect(s.controlPlaneJobMinutesPerHour).toBe(6);
    expect(s.controlPlaneShare).toBeCloseTo(3 / 13, 3);
    expect(s.alarm.firing).toBe(false);
  });
});
