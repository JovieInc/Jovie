import { describe, expect, it } from 'vitest';
import { OVIE_FLEET_ROSTER } from '@/lib/ovie/fleet-room';
import { linearCommentToRoomEvent } from './linear-source';

const issue = {
  identifier: 'JOV-12296',
  title: 'Make Linear the one fleet bus',
  url: 'https://linear.app/jovie/issue/JOV-12296/make-linear-the-one-fleet-bus',
};

describe('linearCommentToRoomEvent', () => {
  it('attributes a prefixed comment posted from the shared account', () => {
    const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
      id: '272f1c92',
      body: '[Claude Duet (Elsa) → fleet] Guardrail from Tim: "dont use legacy."',
      createdAt: '2026-11-11T20:06:34.730Z',
      userId: 'bb142ab2-e0e9-4f89-b330-b484d6b32139',
      issue,
    });
    expect(event).toMatchObject({
      id: 'linear-comment:272f1c92',
      roomId: 'ovie:fleet',
      agentId: 'elsa',
      speakerLabel: 'Elsa',
      to: 'fleet',
      kind: 'message',
      excerpt: 'Guardrail from Tim: "dont use legacy."',
      thread: { ref: 'JOV-12296', url: issue.url },
    });
  });

  it('attributes an installed agent app by its account and flags its failures', () => {
    const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
      id: 'f79d0e91',
      body: "Codex couldn't start a task for this request: You have reached your Codex usage limits.",
      createdAt: '2026-11-11T20:06:39.613Z',
      userId: 'c802cb9b-dcdd-4081-afa9-376e905b73ab',
      issue,
    });
    expect(event).toMatchObject({ agentId: 'codex', kind: 'error', to: null });
  });

  it('names an unknown speaker as written and keeps unattributed comments out', () => {
    expect(
      linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
        id: 'x1',
        body: '[Gem → Lola] lane is green',
        createdAt: '2026-11-11T20:00:00.000Z',
        userId: null,
        issue,
      })
    ).toMatchObject({ agentId: 'x-gem', speakerLabel: 'Gem', to: 'lola' });
    expect(
      linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
        id: 'x2',
        body: 'Validation lifecycle moved JOV-12296 from In Progress to Merging.',
        createdAt: '2026-11-11T19:29:43.572Z',
        userId: 'bb142ab2-e0e9-4f89-b330-b484d6b32139',
        issue,
      })
    ).toBeNull();
  });

  it('drops a thread link that is not on linear.app', () => {
    const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
      id: 'x3',
      body: '[Lola → Chloe] ping',
      createdAt: '2026-11-11T20:00:00.000Z',
      userId: null,
      issue: { ...issue, url: 'https://evil.example/issue' },
    });
    expect(event?.thread.url).toBeNull();
  });
});
