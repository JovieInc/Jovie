import { NextResponse } from 'next/server';
import { buildAgentHandoffDiscovery } from '@/lib/acquisition/agent-handoff';
import { defaultAcquisitionEligibilityDeps } from '@/lib/acquisition/eligibility.server';

export const runtime = 'nodejs';

/** Read the existing matrix owner, never run live canaries on public discovery. */
export async function GET() {
  const source = await defaultAcquisitionEligibilityDeps
    .readCommerceDecision()
    .catch(() => null);
  return NextResponse.json(await buildAgentHandoffDiscovery(source), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
