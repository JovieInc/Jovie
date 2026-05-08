import { describe, expect, it, vi } from 'vitest';
import { areAgentOsWorkflowsEnabled } from '@/lib/agent-os/workflows';
import { env } from '@/lib/env-server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: {
    AGENT_OS_WORKFLOWS_ENABLED: undefined,
  },
}));

describe('AgentOS workflow runtime gate', () => {
  it('defaults to disabled when unset', () => {
    env.AGENT_OS_WORKFLOWS_ENABLED = undefined;

    expect(areAgentOsWorkflowsEnabled()).toBe(false);
  });

  it('enables workflows only when explicitly set to true', () => {
    env.AGENT_OS_WORKFLOWS_ENABLED = 'false';
    expect(areAgentOsWorkflowsEnabled()).toBe(false);

    env.AGENT_OS_WORKFLOWS_ENABLED = 'true';
    expect(areAgentOsWorkflowsEnabled()).toBe(true);
  });
});
