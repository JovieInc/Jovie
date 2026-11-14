import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readLimit: vi.fn(),
  writeLimit: vi.fn(),
  globalLimit: vi.fn(),
  flag: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: { limit: mocks.readLimit },
  agentProfileCreateLimiter: { limit: mocks.writeLimit },
  agentWriteGlobalLimiter: { limit: mocks.globalLimit },
  getClientIP: () => '192.0.2.1',
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('./artist-resolution', () => ({ resolveAgentArtist: vi.fn() }));
vi.mock('./draft-store', () => ({
  createAgentDraft: vi.fn(),
  readAgentDraft: vi.fn(),
}));
vi.mock('./release-launch', () => ({ prepareReleaseLaunch: vi.fn() }));
vi.mock('./golden-path.server', () => ({
  claimHandle: vi.fn(),
  answerOnboardingQuestion: vi.fn(),
  getQualification: vi.fn(),
  buildProfile: vi.fn(),
  publishProfile: vi.fn(),
  shareProfile: vi.fn(),
  startUpgrade: vi.fn(),
}));

import { POST as mcpPost } from '@/app/api/mcp/route';
import { BASE_URL } from '@/constants/app';
import { AGENT_DRAFT_TOOLS } from './api';

const request = (body: unknown) =>
  new Request(`${BASE_URL}/api/agents/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const rpc = (
  method: string,
  params?: unknown,
  id: string | number = 'req-1'
) => ({ jsonrpc: '2.0', id, method, params });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.flag.mockResolvedValue(true);
  mocks.readLimit.mockResolvedValue({ success: true });
  mocks.writeLimit.mockResolvedValue({ success: true });
  mocks.globalLimit.mockResolvedValue({ success: true });
});

describe('tools/list registry pins', () => {
  it('lists the draft tools and the golden-path steps in order', async () => {
    const list = await mcpPost(request(rpc('tools/list')));
    const tools = (await list.json()).result.tools as {
      name: string;
      title: string;
      annotations: Record<string, unknown>;
    }[];
    expect(tools.map(tool => tool.title)).toEqual([
      'Find artist',
      'Create artist draft',
      'Prepare release launch',
      'Claim a handle',
      'Record a Mom Test answer',
      'Get qualification',
      'Build profile preview',
      'Publish profile',
      'Share a profile',
      'Start upgrade',
    ]);
    expect(tools.map(tool => tool.name)).toEqual([
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
      'claim_handle',
      'answer_onboarding_question',
      'get_qualification',
      'build_profile',
      'publish_profile',
      'share_profile',
      'start_upgrade',
    ]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations.title).toBe(tool.title);
    }
  });

  it('keeps AGENT_DRAFT_TOOLS aligned with the pinned list', () => {
    expect(AGENT_DRAFT_TOOLS.map(tool => tool.name)).toHaveLength(10);
  });
});
