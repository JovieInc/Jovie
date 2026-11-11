import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCoordinate, mockFeedback } = vi.hoisted(() => ({
  mockCoordinate: vi.fn(),
  mockFeedback: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/linear-coordination', () => ({
  coordinateLinearWork: mockCoordinate,
}));
vi.mock('@/lib/ovie/linear-coordination-live', () => ({
  createLiveLinearCoordinationDeps: vi.fn(() => ({})),
}));
vi.mock('@/lib/ovie/mcp/founder-work', () => ({
  OVIE_LINEAR_TEAM_ID: 'team-jov',
}));
vi.mock('@/lib/chat/submit-feedback', () => ({
  submitChatFeedback: mockFeedback,
}));

import {
  buildFounderCapabilityIssue,
  submitCapabilityRequest,
} from '@/lib/chat/capability-request';

const base = {
  clerkUserId: 'user-1',
  conversationId: 'conv-1',
  kind: 'capability' as const,
  request: 'Post my weekly plan to Instagram for me.',
};

describe('submitCapabilityRequest', () => {
  beforeEach(() => {
    mockCoordinate.mockReset();
    mockFeedback.mockReset();
    mockFeedback.mockResolvedValue({ success: true });
  });

  it("files the founder's request on the JOV team as founder priority", async () => {
    mockCoordinate.mockResolvedValue({
      status: 'ok',
      receipt: { identifier: 'JOV-1' },
    });
    const result = await submitCapabilityRequest({ ...base, founder: true });
    expect(result).toEqual({
      success: true,
      routedTo: 'summer',
      priority: 'founder',
      identifier: 'JOV-1',
    });
    const [request] = mockCoordinate.mock.calls[0];
    expect(request).toMatchObject({
      action: 'create',
      teamId: 'team-jov',
      founderIntentRef: 'jovie-chat:conv-1',
      author: 'jovie-chat',
      priority: 1,
    });
    expect(request.title).toContain('Founder priority');
    expect(mockFeedback).not.toHaveBeenCalled();
  });

  it('never files twice when the issue was created but not read back', async () => {
    mockCoordinate.mockResolvedValue({
      status: 'failed',
      code: 'readback-missing',
      message: 'readback failed',
      mutated: { id: 'issue_1', identifier: 'JOV-2' },
    });
    const result = await submitCapabilityRequest({ ...base, founder: true });
    expect(result).toEqual({
      success: true,
      routedTo: 'summer',
      priority: 'founder',
      identifier: 'JOV-2',
    });
    expect(mockFeedback).not.toHaveBeenCalled();
  });

  it('falls back to the feedback loop when Linear refuses', async () => {
    mockCoordinate.mockResolvedValue({
      status: 'denied',
      code: 'capability-denied',
    });
    const result = await submitCapabilityRequest({ ...base, founder: true });
    expect(result).toMatchObject({ routedTo: 'feedback', priority: 'founder' });
    expect(mockFeedback.mock.calls[0][0].message).toMatch(
      /^Capability request \(Founder priority\): /
    );
  });

  it("sends an artist's request to the feedback loop, never to Linear", async () => {
    const result = await submitCapabilityRequest({ ...base, founder: false });
    expect(result).toEqual({
      success: true,
      routedTo: 'feedback',
      priority: 'standard',
    });
    expect(mockCoordinate).not.toHaveBeenCalled();
  });
});

describe('buildFounderCapabilityIssue', () => {
  it('carries a taught skill draft', () => {
    const issue = buildFounderCapabilityIssue({
      kind: 'skill',
      request: 'Every Friday, plan my DJ clip posts.',
      skillDraft:
        '---\nname: friday-clips\ndescription: x\n---\n# Friday clips',
    });
    expect(issue.title).toMatch(/^Skill request \(Founder priority\): /);
    expect(issue.body).toContain('## Skill draft');
    expect(issue.body).toContain('name: friday-clips');
  });
});
