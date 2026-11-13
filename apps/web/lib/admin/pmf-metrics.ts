import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { externalAccountSql } from '@/lib/accounts/internal-account';
import {
  activatedUserSql,
  admittedUserSql,
} from '@/lib/activation/admitted-activation';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { computePmfMetrics, type PmfMetrics } from './pmf-metrics-model';

type PmfMetricsRow = {
  admitted_users: string | number | null;
  activated_users: string | number | null;
  survey_responses: string | number | null;
  very_disappointed: string | number | null;
};

/**
 * Read-only PMF metric for the admin Growth page: activation of admitted
 * users and the survey's very-disappointed share. Internal and test accounts
 * are excluded with the shared classifier. Returns null when the read fails,
 * so the page shows an honest error instead of a zero.
 */
export async function getPmfMetrics(): Promise<PmfMetrics | null> {
  try {
    const admitted = admittedUserSql(drizzleSql.raw('bu.user_status'));
    const result = await db.execute<PmfMetricsRow>(drizzleSql`
      WITH base_users AS (
        SELECT u.id, u.user_status
        FROM users u
        WHERE u.deleted_at IS NULL
        AND ${externalAccountSql(drizzleSql.raw('u.email'), drizzleSql.raw('u.account_class'))}
      ),
      answers AS (
        SELECT r.response
        FROM pmf_survey_responses r
        JOIN base_users bu ON bu.id = r.user_id
        WHERE r.answered_at IS NOT NULL
      )
      SELECT
        (SELECT count(*) FROM base_users bu WHERE ${admitted}) AS admitted_users,
        (SELECT count(*) FROM base_users bu
          WHERE ${admitted} AND ${activatedUserSql(drizzleSql.raw('bu.id'))}) AS activated_users,
        (SELECT count(*) FROM answers) AS survey_responses,
        (SELECT count(*) FROM answers
          WHERE response = 'very_disappointed') AS very_disappointed
    `);
    const row = result.rows?.[0];
    return computePmfMetrics({
      admittedUsers: Number(row?.admitted_users ?? 0),
      activatedUsers: Number(row?.activated_users ?? 0),
      surveyResponses: Number(row?.survey_responses ?? 0),
      veryDisappointed: Number(row?.very_disappointed ?? 0),
    });
  } catch (error) {
    await captureError('Error fetching PMF metrics', error, {
      route: 'lib/admin/pmf-metrics',
    });
    return null;
  }
}
