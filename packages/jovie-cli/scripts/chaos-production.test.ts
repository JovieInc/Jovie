import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'jovie-chaos-production-'));
const bin = join(directory, 'cli.mjs');
const gate = resolve(import.meta.dirname, 'chaos-blackbox.mjs');
const publicOpenApi = {
  openapi: '3.1.0',
  info: { title: 'Jovie Public API' },
};

// Exercise the real production scenario without contacting external services.
writeFileSync(
  bin,
  `const args = process.argv.slice(2);
if (args[0] === 'docs' && args.includes('https://expired.badssl.com')) {
  console.error('TLS certificate is invalid.');
  process.exitCode = 1;
} else if (args[0] === 'docs') {
  console.log('Jovie public documentation');
} else if (args[0] === 'api' && args[1] === 'openapi') {
  process.stdout.write(process.env.CHAOS_OPENAPI_RESPONSE);
  process.exitCode = Number(process.env.CHAOS_OPENAPI_EXIT_CODE);
} else if (args[0] === 'artist' && args[1] === 'get') {
  console.error('No public Jovie artist found.');
  process.exitCode = 1;
} else {
  throw new Error('Unexpected fixture command');
}
`
);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('production OpenAPI chaos probe (JOV-7915)', () => {
  it.each([
    ['current public contract', JSON.stringify(publicOpenApi), '0', 0],
    [
      'unrelated API',
      JSON.stringify({ ...publicOpenApi, info: { title: 'Other API' } }),
      '0',
      1,
    ],
    [
      'unsupported OpenAPI version',
      JSON.stringify({ ...publicOpenApi, openapi: '2.0' }),
      '0',
      1,
    ],
    ['missing metadata', JSON.stringify({ openapi: '3.1.0' }), '0', 1],
    ['malformed JSON', '{', '0', 1],
    ['failed CLI command', JSON.stringify(publicOpenApi), '1', 1],
  ])('validates the %s', (_, response, apiExitCode, expected) => {
    const result = spawnSync(
      process.execPath,
      [gate, '--bin', bin, '--prod', '--only', 'prod-read-only'],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          CHAOS_OPENAPI_RESPONSE: response,
          CHAOS_OPENAPI_EXIT_CODE: apiExitCode,
        },
      }
    );
    expect(result.status, result.stdout + result.stderr).toBe(expected);
    expect(result.stdout).toContain(`${expected === 0 ? 1 : 0}/1 scenarios`);
  });
});
