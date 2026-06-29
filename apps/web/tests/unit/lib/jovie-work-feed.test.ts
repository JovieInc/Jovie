import { describe, expect, it } from 'vitest';
import {
  humanizeSlug,
  mapAgentRunStatusToPhase,
  mapFanNotificationToJovieWorkItem,
  mapMetadataSubmissionStatusToPhase,
  mapSuggestedActionToJovieWorkItem,
  mapWorkflowRunToJovieWorkItem,
  mergeJovieWorkItems,
  parseJovieWorkFeedResponse,
  phaseToStatusLabel,
} from '@/lib/activity/jovie-work-feed';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';

describe('jovie work feed contract', () => {
  it('humanizes workflow and agent slugs', () => {
    expect(humanizeSlug('calendar.create_event')).toBe('Calendar Create Event');
    expect(humanizeSlug('release-to-revenue')).toBe('Release To Revenue');
  });

  it('maps workflow runs with release titles from step outputs', () => {
    const item = mapWorkflowRunToJovieWorkItem({
      id: 'run-1',
      kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
      status: 'completed',
      currentStep: 'publish_store',
      stepOutputs: {
        release: { title: 'Midnight Drive' },
      },
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-21T12:00:00.000Z',
    });

    expect(item).toMatchObject({
      id: 'workflow:run-1',
      source: 'workflow_run',
      phase: 'completed',
      title: 'Release autopilot',
      description: 'Jovie ran release-to-revenue for Midnight Drive.',
      statusLabel: 'Done',
    });
  });

  it('maps suggested actions to pending approvals', () => {
    const item = mapSuggestedActionToJovieWorkItem({
      id: 'action-1',
      kind: 'calendar.create_event',
      status: 'pending',
      payload: { title: 'Brooklyn Show' },
      rationale: 'Booking email mentioned a June date.',
      createdAt: '2026-06-22T10:00:00.000Z',
      approvedAt: null,
      executedAt: null,
    });

    expect(item).toMatchObject({
      id: 'action:action-1',
      source: 'suggested_action',
      phase: 'pending',
      title: 'Calendar event: Brooklyn Show',
      statusLabel: 'Needs approval',
    });
  });

  it('maps fan notifications and metadata statuses', () => {
    expect(mapMetadataSubmissionStatusToPhase('awaiting_approval')).toBe(
      'pending'
    );
    expect(mapAgentRunStatusToPhase('waiting_for_approval')).toBe('pending');
    expect(phaseToStatusLabel('in_progress')).toBe('In progress');

    const notification = mapFanNotificationToJovieWorkItem({
      id: 'fan-1',
      status: 'sent',
      notificationType: 'release_day',
      releaseTitle: 'Neon Skyline',
      sentAt: '2026-06-23T18:00:00.000Z',
      scheduledFor: '2026-06-23T17:30:00.000Z',
      createdAt: '2026-06-23T12:00:00.000Z',
    });

    expect(notification.phase).toBe('completed');
    expect(notification.description).toContain('Neon Skyline');
  });

  it('merges and sorts items by timestamp descending', () => {
    const merged = mergeJovieWorkItems(
      [
        {
          id: 'a',
          source: 'agent_run',
          phase: 'completed',
          title: 'Older',
          description: 'Older item',
          icon: 'agent',
          timestamp: '2026-06-20T00:00:00.000Z',
          statusLabel: 'Done',
        },
        {
          id: 'b',
          source: 'workflow_run',
          phase: 'in_progress',
          title: 'Newer',
          description: 'Newer item',
          icon: 'workflow',
          timestamp: '2026-06-23T00:00:00.000Z',
          statusLabel: 'In progress',
        },
      ],
      10
    );

    expect(merged.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('parses valid API payloads and drops malformed rows', () => {
    expect(
      parseJovieWorkFeedResponse({
        items: [
          {
            id: 'workflow:1',
            source: 'workflow_run',
            phase: 'completed',
            title: 'Release autopilot',
            description: 'Done',
            icon: 'workflow',
            timestamp: '2026-06-23T00:00:00.000Z',
            statusLabel: 'Done',
          },
          {
            id: 42,
            source: 'workflow_run',
            phase: 'completed',
            title: 'Bad row',
            description: 'Bad',
            icon: 'workflow',
            timestamp: '2026-06-23T00:00:00.000Z',
            statusLabel: 'Done',
          },
        ],
      })
    ).toHaveLength(1);
  });
});
