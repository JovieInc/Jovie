import { describe, expect, it } from 'vitest';
import {
  coldSegmentKey,
  type FunnelRecord,
  nextPipelineStep,
  summarizeFunnel,
} from './funnel';

const at = (hours: number) =>
  new Date(Date.UTC(2026, 9, 1) + hours * 3_600_000);

const records: FunnelRecord[] = [
  {
    leadId: 'a',
    segment: 's',
    stages: {
      prospected: at(0),
      built: at(1),
      certified: at(3),
      drafted: at(3),
      approved: at(10),
      sent: at(20),
      replied: at(40),
    },
  },
  {
    leadId: 'b',
    segment: 's',
    stages: { prospected: at(0), built: at(2), certified: at(5) },
  },
  { leadId: 'c', segment: 's', stages: { prospected: at(0) } },
  {
    leadId: 'd',
    segment: 'other',
    stages: { prospected: at(0), built: at(1) },
  },
];

describe('summarizeFunnel', () => {
  it('counts stages, conversion and dwell per segment', () => {
    const funnel = summarizeFunnel(records, 's');
    expect(funnel.leads).toBe(3);
    const built = funnel.stages.find(s => s.stage === 'built');
    expect(built).toMatchObject({
      reached: 2,
      conversion: 2 / 3,
      dwellP50Hours: 1,
      dwellP95Hours: 2,
    });
    const certified = funnel.stages.find(s => s.stage === 'certified');
    expect(certified?.dwellP95Hours).toBe(3);
  });

  it('names the leakiest stage as the bottleneck', () => {
    // a replied but has not claimed: sent -> claimed converts 0 of 1.
    expect(summarizeFunnel(records, 's').bottleneck).toBe('claimed');
  });
});

describe('pipeline and segments', () => {
  it('advances one event at a time', () => {
    expect(nextPipelineStep({})).toBe('build_artifact');
    expect(nextPipelineStep({ built: at(1) })).toBe('certify_artifact');
    expect(nextPipelineStep({ built: at(1), certified: at(2) })).toBe(
      'draft_copy'
    );
    expect(nextPipelineStep({ drafted: at(2) })).toBe('await_review');
    expect(nextPipelineStep({ approved: at(2) })).toBe('await_send');
    expect(nextPipelineStep({ sent: at(2) })).toBe('in_sequence');
    expect(nextPipelineStep({ sent: at(2), replied: at(3) })).toBe('done');
  });

  it('keys segments by channel and trigger', () => {
    expect(coldSegmentKey({ channel: 'email', recentRelease: true })).toBe(
      'email:recent_release'
    );
    expect(coldSegmentKey({ channel: 'dm', recentRelease: false })).toBe(
      'dm:catalog'
    );
  });
});
