import { describe, expect, it } from 'vitest';
import { PRESENCE_BUILD_STEPS, PRESENCE_BUILD_TOOL_NAMES } from './constants';
import {
  buildInitialPresenceToolEvents,
  buildRunningToolEvent,
  buildSucceededToolEvent,
  replaceToolEvent,
} from './tool-events';

describe('presence-build tool events', () => {
  it('seeds one running tool event per presence-build step', () => {
    const events = buildInitialPresenceToolEvents();
    expect(events).toHaveLength(PRESENCE_BUILD_STEPS.length);
    expect(events.every(event => event.state === 'running')).toBe(true);
    expect(events.map(event => event.toolName)).toEqual(
      PRESENCE_BUILD_STEPS.map(step => PRESENCE_BUILD_TOOL_NAMES[step])
    );
  });

  it('replaces a matching tool event by toolCallId', () => {
    const initial = buildInitialPresenceToolEvents();
    const completed = buildSucceededToolEvent('research_artist', {
      title: 'Artist research',
      summary: 'Found 2 verified signals from your connected sources.',
      facts: [{ label: 'Name', value: 'Ada' }],
    });

    const next = replaceToolEvent(initial, completed);
    expect(next).toHaveLength(PRESENCE_BUILD_STEPS.length);
    expect(next[0]).toEqual(completed);
    expect(next.slice(1).every(event => event.state === 'running')).toBe(true);
  });

  it('never invents follower counts in running events', () => {
    const event = buildRunningToolEvent('research_artist');
    expect(event.output).toBeUndefined();
    expect(JSON.stringify(event)).not.toMatch(/followers?/i);
  });
});
