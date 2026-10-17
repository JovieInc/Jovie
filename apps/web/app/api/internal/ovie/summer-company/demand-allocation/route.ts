import { NextResponse } from 'next/server';
import { unknownAcquisitionEligibility } from '@/lib/acquisition/eligibility';
import { getAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import { parseBoundedJsonBody } from '@/lib/cron/evidence-route';
import { demandAllocationCommandSchema } from '@/lib/demand/allocation-contract';
import {
  DemandAllocationError,
  governDemandAllocation,
} from '@/lib/demand/allocation-governor';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const ROUTE = '/api/internal/ovie/summer-company/demand-allocation';

/** Summer's bounded pull queue. Workers claim before acting and report proof
 * afterward; source allocation never authorizes production, spend or outbound.
 * Reconcile on material evidence changes or a declared outcome horizon. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request)))
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  const body = await parseBoundedJsonBody(request, 128 * 1024);
  if (!body.ok) return body.response;
  const command = demandAllocationCommandSchema.safeParse(body.value);
  if (!command.success)
    return NextResponse.json(
      { error: 'invalid_command' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  try {
    let eligibility;
    try {
      eligibility = await getAcquisitionEligibility({ fresh: true });
    } catch {
      eligibility = unknownAcquisitionEligibility(
        new Date(),
        'Eligibility source unavailable.'
      );
    }
    const now = new Date();
    const ledger = await governDemandAllocation({
      backend: postgresRecordBackend(),
      command: command.data,
      now,
      gate: {
        status: eligibility.eligible
          ? 'green'
          : eligibility.verdict === 'BLOCKED'
            ? 'red'
            : 'unknown',
        evaluatedAt: eligibility.evaluatedAt,
        ref: `${eligibility.contract}:${eligibility.firstBlocker?.id ?? eligibility.verdict}`,
      },
    });
    return NextResponse.json(
      {
        ledger,
        dueReviews: ledger.rows
          .filter(
            row =>
              row.execution &&
              (!row.reviews.length ||
                row.reviews.at(-1)?.verdict === 'inconclusive') &&
              Date.parse(row.execution.reviewDueAt) <= now.getTime()
          )
          .map(row => row.plan.id),
        overdueExecutions: ledger.rows
          .filter(
            row =>
              row.execution &&
              !row.execution.completedAt &&
              Date.parse(row.execution.effortDueAt) <= now.getTime()
          )
          .map(row => row.plan.id),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof DemandAllocationError)
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    await captureError('Demand allocation failed', error, { route: ROUTE });
    return NextResponse.json(
      { error: 'allocation_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
