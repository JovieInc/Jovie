export const CALENDAR_CREATE_EVENT_KIND = 'calendar.create_event' as const;
export const BRAND_DEAL_OPPORTUNITY_KIND = 'brand_deal.opportunity' as const;
export const EXPERIMENT_REPORT_KIND = 'experiment.report' as const;
export const YOUTUBE_THUMBNAIL_PLAYBOOK_KIND =
  'youtube.thumbnail_experiment' as const;
export const YOUTUBE_THUMBNAIL_CANDIDATE_KIND =
  'youtube.thumbnail_candidate' as const;
export const WORKFLOW_CAPTURE_REQUEST_KIND =
  'workflow_capture.request' as const;

export const THUMBNAIL_DECISION_KINDS = [
  YOUTUBE_THUMBNAIL_PLAYBOOK_KIND,
  YOUTUBE_THUMBNAIL_CANDIDATE_KIND,
] as const;

export type ThumbnailDecisionKind = (typeof THUMBNAIL_DECISION_KINDS)[number];

export function isThumbnailDecisionKind(
  kind: string
): kind is ThumbnailDecisionKind {
  return (THUMBNAIL_DECISION_KINDS as readonly string[]).includes(kind);
}
