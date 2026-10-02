import 'server-only';

import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * Admission throttle (JOV-3379, Tim 2026-09-29): new cohorts open only while
 * the current cohort's open learnings (Linear issues labeled
 * `cohort-learning`) stay below the cap, so existing feedback is resolved
 * before more people arrive.
 */
export const COHORT_LEARNING_LABEL = 'cohort-learning';
export const MAX_OPEN_COHORT_LEARNINGS = 10;

const QUERY = `query OpenCohortLearnings($label: String!, $first: Int!) {
  issues(
    first: $first
    filter: {
      labels: { name: { eq: $label } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
  ) { nodes { id } }
}`;

/**
 * Open cohort-learning count, capped at MAX_OPEN_COHORT_LEARNINGS. Null when
 * Linear cannot be read; callers must fail closed (admit nobody).
 */
export async function countOpenCohortLearnings(): Promise<number | null> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          label: COHORT_LEARNING_LABEL,
          first: MAX_OPEN_COHORT_LEARNINGS,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Linear API error (${response.status})`);
    const payload = (await response.json()) as {
      data?: { issues?: { nodes?: unknown[] } };
      errors?: unknown[];
    };
    const nodes = payload.data?.issues?.nodes;
    if (payload.errors?.length || !Array.isArray(nodes)) {
      throw new Error('Linear GraphQL returned no issues');
    }
    return nodes.length;
  } catch (error) {
    logger.warn('[waitlist] Could not read open cohort learnings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
