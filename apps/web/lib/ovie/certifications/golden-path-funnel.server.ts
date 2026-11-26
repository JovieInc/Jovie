import 'server-only';

import { BASE_URL } from '@/constants/domains';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { goldenPathFunnelView } from './golden-path-funnel';
import { readProdGoldenPathLedger } from './prod-golden-path-ledger';

async function readLiveBuild(): Promise<{
  sha: string;
  deploymentId: string | null;
} | null> {
  const response = await fetch(`${BASE_URL}/api/health/build-info`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const build: {
    commitSha?: unknown;
    deploymentId?: unknown;
    environment?: unknown;
  } = await response.json();
  if (
    build?.environment !== 'production' ||
    typeof build.commitSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(build.commitSha)
  )
    return null;
  return {
    sha: build.commitSha,
    deploymentId:
      typeof build.deploymentId === 'string' ? build.deploymentId : null,
  };
}

export async function loadGoldenPathFunnel() {
  const [ledger, liveBuild] = await Promise.allSettled([
    Promise.resolve().then(() =>
      readProdGoldenPathLedger(postgresRecordBackend())
    ),
    readLiveBuild(),
  ]);
  const build = liveBuild.status === 'fulfilled' ? liveBuild.value : null;
  return goldenPathFunnelView(
    ledger.status === 'fulfilled' ? ledger.value : null,
    build?.sha ?? null,
    Date.now(),
    build?.deploymentId
  );
}
