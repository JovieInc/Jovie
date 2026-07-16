import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getLighthousePublicSurfaceManifest } from '@/tests/e2e/utils/public-surface-manifest';

const BASE_URL = process.env.BASE_URL?.trim();

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return parsed;
}

function parseShardIndex(value: string | undefined, totalShards: number) {
  if (!value?.trim()) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= totalShards) {
    throw new Error(
      `PUBLIC_LIGHTHOUSE_SHARD_INDEX must be between 0 and ${totalShards - 1}; got "${value}"`
    );
  }
  return parsed;
}

function getValidatedBaseUrl(): string {
  if (!BASE_URL) {
    throw new Error('BASE_URL is required for public Lighthouse runs');
  }

  return new URL(BASE_URL).toString();
}

function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const baseUrl = getValidatedBaseUrl();
  const surfaces = getLighthousePublicSurfaceManifest();
  const urls = surfaces.map(surface =>
    new URL(surface.resolvedPath, baseUrl).toString()
  );
  const totalShards = parsePositiveInteger(
    process.env.PUBLIC_LIGHTHOUSE_TOTAL_SHARDS,
    1
  );
  const shardIndex = parseShardIndex(
    process.env.PUBLIC_LIGHTHOUSE_SHARD_INDEX,
    totalShards
  );
  const selectedUrls = urls.filter(
    (_, index) => index % totalShards === shardIndex
  );

  if (selectedUrls.length === 0) {
    throw new Error(
      `No public Lighthouse URLs selected for shard ${shardIndex}/${totalShards}`
    );
  }

  console.log(
    `Running public Lighthouse shard ${shardIndex + 1}/${totalShards}: ${selectedUrls.length}/${urls.length} URLs`
  );

  const args = [
    'exec',
    'lhci',
    'autorun',
    '--config=.lighthouserc.public-launch.json',
    ...selectedUrls.map(url => `--collect.url=${url}`),
  ];

  const retryWrapper = fileURLToPath(
    new URL('../../../scripts/lighthouse-retry.mjs', import.meta.url)
  );
  await runCommand(
    process.execPath,
    [retryWrapper, '--', 'pnpm', ...args],
    process.env
  );
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
