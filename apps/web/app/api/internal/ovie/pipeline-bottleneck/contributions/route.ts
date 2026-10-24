import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  PIPELINE_CONTRIBUTION_MAX_BYTES,
  pipelineBottleneckContributionSchema,
} from '@/lib/ovie/pipeline-bottleneck';
import { writePipelineBottleneckContribution } from '@/lib/ovie/pipeline-bottleneck.server';

const ROUTE = '/api/internal/ovie/pipeline-bottleneck/contributions';

export async function POST(request: Request): Promise<NextResponse> {
  const denied = verifyCronRequest(request, { route: ROUTE });
  if (denied) return denied;
  try {
    const body = await parseJsonBody<unknown>(request, {
      route: ROUTE,
      maxBodySize: PIPELINE_CONTRIBUTION_MAX_BYTES,
      headers: NO_STORE_HEADERS,
      redactParseErrors: true,
    });
    if (!body.ok) return body.response;
    const parsed = pipelineBottleneckContributionSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid contribution' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    await writePipelineBottleneckContribution(parsed.data);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Pipeline bottleneck contribution write failed', error);
    return NextResponse.json(
      { error: 'Contribution unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
