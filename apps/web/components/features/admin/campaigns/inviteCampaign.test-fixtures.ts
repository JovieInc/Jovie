import type {
  CampaignInviteListItem,
  CampaignInviteListResponse,
  CampaignOverviewResponse,
  CampaignPreviewResponse,
  CampaignSettingsResponse,
  CampaignStatsResponse,
  SendCampaignInvitesResponse,
} from '@/lib/queries/useCampaignInvites';

/**
 * Campaign API fixtures shared by the InviteCampaignManager certificate test
 * and state stories. Each state is a route table for the six campaign
 * endpoints the manager reads and writes, so the real query hooks run.
 */
export const CAMPAIGN_FIXTURE_NOW = '2026-01-15T12:00:00.000Z';

export const campaignSettings: CampaignSettingsResponse = {
  ok: true,
  settings: {
    fitScoreThreshold: 60,
    batchLimit: 10,
    throttlingConfig: {
      minDelayMs: 30_000,
      maxDelayMs: 90_000,
      maxPerHour: 30,
    },
    updatedAt: CAMPAIGN_FIXTURE_NOW,
    updatedBy: 'admin@example.com',
  },
};

export function buildPreview(
  withEmails: number,
  withoutEmails = 0,
  profiles: CampaignPreviewResponse['sample']['profiles'] = [
    {
      id: 'p1',
      username: 'harborlights',
      displayName: 'Harbor Lights',
      fitScore: 82,
      email: 'hello@harborlights.example.com',
    },
    {
      id: 'p2',
      username: 'velvetstatic',
      displayName: 'Velvet Static',
      fitScore: null,
      email: 'team@velvetstatic.example.com',
    },
  ]
): CampaignPreviewResponse {
  return {
    ok: true,
    threshold: 60,
    totalEligible: withEmails + withoutEmails,
    sample: { withEmails, withoutEmails, profiles },
  };
}

export const campaignStats: CampaignStatsResponse = {
  ok: true,
  campaign: {
    total: 120,
    pending: 4,
    sending: 2,
    sent: 100,
    failed: 3,
    claimed: 11,
  },
  jobQueue: {
    pending: 0,
    processing: 0,
    succeeded: 96,
    failed: 3,
    nextRunAt: null,
    estimatedMinutesRemaining: 0,
  },
  updatedAt: CAMPAIGN_FIXTURE_NOW,
};

export const activeQueueStats: CampaignStatsResponse = {
  ...campaignStats,
  jobQueue: {
    pending: 6,
    processing: 1,
    succeeded: 96,
    failed: 3,
    nextRunAt: CAMPAIGN_FIXTURE_NOW,
    estimatedMinutesRemaining: 9,
  },
};

export const campaignOverview: CampaignOverviewResponse = {
  ok: true,
  range: '30d',
  invites: {
    total: 120,
    pending: 4,
    scheduled: 0,
    sending: 2,
    sent: 100,
    bounced: 1,
    failed: 3,
    unsubscribed: 0,
  },
  engagement: {
    totalOpens: 80,
    uniqueOpens: 64,
    totalClicks: 30,
    uniqueClicks: 24,
    openRate: 64,
    clickRate: 24,
    clickToOpenRate: 37.5,
  },
  conversion: { profilesClaimed: 11, claimRate: 11 },
  updatedAt: CAMPAIGN_FIXTURE_NOW,
};

export function buildInvite(
  id: string,
  username: string,
  overrides: Partial<CampaignInviteListItem> = {}
): CampaignInviteListItem {
  return {
    id,
    email: `${username}@example.com`,
    status: 'sent',
    createdAt: CAMPAIGN_FIXTURE_NOW,
    sentAt: CAMPAIGN_FIXTURE_NOW,
    profile: {
      id: `profile-${id}`,
      username,
      displayName: null,
      avatarUrl: null,
      fitScore: 75,
      isClaimed: false,
    },
    engagement: {
      opened: false,
      openedAt: null,
      clicked: false,
      clickedAt: null,
      clickCount: 0,
    },
    ...overrides,
  };
}

export function inviteList(
  invites: CampaignInviteListItem[]
): CampaignInviteListResponse {
  return {
    ok: true,
    invites,
    pagination: { total: invites.length, limit: 10, offset: 0, hasMore: false },
  };
}

export const recentInvites = inviteList([
  buildInvite('i1', 'harborlights', {
    engagement: {
      opened: true,
      openedAt: CAMPAIGN_FIXTURE_NOW,
      clicked: true,
      clickedAt: CAMPAIGN_FIXTURE_NOW,
      clickCount: 3,
    },
    profile: {
      id: 'profile-i1',
      username: 'harborlights',
      displayName: 'Harbor Lights',
      avatarUrl: null,
      fitScore: 82,
      isClaimed: true,
    },
  }),
  buildInvite('i2', 'velvetstatic', {
    engagement: {
      opened: true,
      openedAt: CAMPAIGN_FIXTURE_NOW,
      clicked: false,
      clickedAt: null,
      clickCount: 0,
    },
  }),
  buildInvite('i3', 'papercomets', { status: 'pending', sentAt: null }),
]);

export type CampaignReply = () => Promise<Response>;

export interface CampaignRoutes {
  readonly settings?: CampaignReply;
  readonly preview?: CampaignReply;
  readonly stats?: CampaignReply;
  readonly overview?: CampaignReply;
  readonly invites?: CampaignReply;
  readonly send?: CampaignReply;
}

export function json(body: unknown, status = 200): CampaignReply {
  return async () => Response.json(body, { status });
}

export const never: CampaignReply = () => new Promise<Response>(() => {});

export const offline: CampaignReply = () =>
  Promise.reject(new TypeError('Failed to fetch'));

export function sendResult(result: SendCampaignInvitesResponse): CampaignReply {
  return json(result);
}

export const healthyRoutes: Required<CampaignRoutes> = {
  settings: json(campaignSettings),
  preview: json(buildPreview(2)),
  stats: json(campaignStats),
  overview: json(campaignOverview),
  invites: json(recentInvites),
  send: sendResult({ ok: true, jobsEnqueued: 2, estimatedMinutes: 2 }),
};

/** Routes one campaign request; returns undefined for any other path. */
export function routeCampaignRequest(
  routes: CampaignRoutes,
  url: URL,
  init?: RequestInit
): Promise<Response> | undefined {
  const all = { ...healthyRoutes, ...routes };
  switch (url.pathname) {
    case '/api/admin/campaigns/settings':
      return all.settings();
    case '/api/admin/creator-invite/bulk':
      return init?.method === 'POST' ? all.send() : all.preview();
    case '/api/admin/creator-invite/bulk/stats':
      return all.stats();
    case '/api/admin/campaigns/stats':
      return all.overview();
    case '/api/admin/campaigns/invites':
      return all.invites();
    default:
      return undefined;
  }
}
