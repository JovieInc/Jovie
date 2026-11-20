import { pathToFileURL } from 'node:url';
import {
  type MusicResolveInput,
  musicResolveResultSchema,
  musicResolveSchema,
} from '../../lib/music-resolver/public-schemas';

/** Run with pnpm exec tsx apps/web/scripts/examples/music-resolve.ts '<input>'. */
export async function resolveMusicV1(
  input: MusicResolveInput,
  baseUrl = 'https://jov.ie',
  fetchImpl: typeof fetch = fetch
) {
  const response = await fetchImpl(new URL('/api/v1/music/resolve', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(musicResolveSchema.parse(input)),
    signal: AbortSignal.timeout(55_000),
  });
  const result = musicResolveResultSchema.parse(await response.json());
  if ('error' in result) {
    throw new Error(
      `${result.error.code} (HTTP ${response.status}, retryable=${result.error.retryable}, request=${response.headers.get('X-Request-Id')}, retryAfter=${response.headers.get('Retry-After')})`
    );
  }
  if (!response.ok) throw new Error(`Unexpected HTTP ${response.status}`);
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  resolveMusicV1({ input: process.argv[2] ?? '' })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
