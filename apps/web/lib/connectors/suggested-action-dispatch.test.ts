import { describe, expect, it } from 'vitest';
import { resolveSuggestedActionDispatch } from './suggested-action-dispatch';

describe('resolveSuggestedActionDispatch', () => {
  it('normalizes a verified calendar action into the only executable mode', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'calendar.create_event',
        payload: {
          title: 'Soundcheck',
          startsAt: '2026-08-28T18:00:00.000Z',
          endsAt: null,
          venueName: 'The Fillmore',
          city: 'San Francisco',
        },
      })
    ).toEqual({
      mode: 'calendar-workflow',
      eventPayload: {
        title: 'Soundcheck',
        startsAt: '2026-08-28T18:00:00.000Z',
        timeZone: 'UTC',
        location: 'The Fillmore, San Francisco',
      },
    });
  });

  it.each([
    'youtube.thumbnail_experiment',
    'youtube.thumbnail_candidate',
  ])('keeps %s decision-only', kind => {
    expect(
      resolveSuggestedActionDispatch({ kind, payload: { title: 'Candidate' } })
    ).toEqual({ mode: 'decision-only', family: 'youtube-thumbnail' });
  });

  it('routes workflow capture to its dedicated handoff', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'workflow_capture.request',
        payload: { title: 'Record Studio' },
      })
    ).toEqual({ mode: 'workflow-capture' });
  });

  it('requires the report next-step route instead of generic approval', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'experiment.report',
        payload: { title: 'Result' },
      })
    ).toEqual({ mode: 'next-step-only' });
  });

  it.each([
    ['unknown kind', 'agent.unregistered', {}, 'unsupported-action-kind'],
    [
      'malformed calendar',
      'calendar.create_event',
      { title: 'Missing time' },
      'invalid-calendar-payload',
    ],
  ])('fails closed for %s', (_name, kind, payload, error) => {
    expect(resolveSuggestedActionDispatch({ kind, payload })).toEqual({
      mode: 'invalid',
      error,
    });
  });
});
