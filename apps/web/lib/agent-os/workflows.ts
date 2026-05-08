import 'server-only';
import { env } from '@/lib/env-server';

export function areAgentOsWorkflowsEnabled(): boolean {
  return env.AGENT_OS_WORKFLOWS_ENABLED === 'true';
}
