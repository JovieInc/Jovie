import { describe, expect, it } from 'vitest';
import {
  humanizeSlug,
  JOVIE_WORK_OUTCOME_SLOT,
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
      outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
      outcome: { state: 'unavailable', metrics: null },
    });
  });

  it.each([
    'waiting_for_approval',
    'running',
    'completed',
  ])('reserves the same typed outcome slot while a release run is %s', status => {
    const item = mapWorkflowRunToJovieWorkItem({
      id: `run-${status}`,
      kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
      status,
      currentStep: null,
      stepOutputs: {},
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-21T12:00:00.000Z',
    });

    expect(item.outcomeSlot).toBe(JOVIE_WORK_OUTCOME_SLOT);
    expect(item.outcome).toEqual(
      status === 'completed'
        ? { state: 'unavailable', metrics: null }
        : undefined
    );
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
            outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
            outcome: {
              state: 'measured_positive',
              metrics: {
                gmvDeltaCents: 1800,
                clickDelta: 0,
                dspClickDelta: 7,
                newFansDelta: 0,
              },
            },
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
    ).toEqual([
      expect.objectContaining({
        id: 'workflow:1',
        outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
        outcome: {
          state: 'measured_positive',
          metrics: {
            gmvDeltaCents: 1800,
            clickDelta: 0,
            dspClickDelta: 7,
            newFansDelta: 0,
          },
        },
      }),
    ]);
  });

  it('drops a fabricated positive outcome with no positive metric', () => {
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
            outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
            outcome: {
              state: 'measured_positive',
              metrics: {
                gmvDeltaCents: 0,
                clickDelta: 0,
                dspClickDelta: 0,
                newFansDelta: 0,
              },
            },
          },
        ],
      })
    ).toEqual([]);
  });

  it('preserves a reserved release slot before outcome data exists', () => {
    expect(
      parseJovieWorkFeedResponse({
        items: [
          {
            id: 'workflow:pending',
            source: 'workflow_run',
            phase: 'pending',
            title: 'Release autopilot',
            description: 'Waiting for approval',
            icon: 'workflow',
            timestamp: '2026-06-23T00:00:00.000Z',
            statusLabel: 'Needs approval',
            outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'workflow:pending',
        outcomeSlot: JOVIE_WORK_OUTCOME_SLOT,
      }),
    ]);
  });

  it('drops outcome data that is not paired with the typed release slot', () => {
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
            outcome: { state: 'unavailable', metrics: null },
          },
        ],
      })
    ).toEqual([]);
  });
});
