import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';
import { createLedger } from '@/lib/recovery/ledger';
import { createProductionCertifier } from '@/lib/recovery/probes.server';
import { buildRecoveryReport } from '@/lib/recovery/report';
import {
  buildServerRunnerDeps,
  loadStalledUsers,
  runRecovery,
} from '@/lib/recovery/server';

export const runtime = 'nodejs';

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/** Summer reads the recovery funnel: sent -> clicked -> returned -> paid. */
export async function GET(request: Request) {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const records = await createLedger(postgresRecordBackend()).listRecords();
  return json({
    contract: 'recovery-emails/v1',
    report: buildRecoveryReport(records),
  });
}

/** Runs the pipeline once. Counts only: no addresses, names or ids. */
export async function POST(request: Request) {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const stalled = await loadStalledUsers();
  const result = await runRecovery(
    buildServerRunnerDeps(createProductionCertifier(), stalled)
  );
  return json({ contract: 'recovery-emails/v1', result });
}
