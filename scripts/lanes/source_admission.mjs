// Transport adapter only: the canonical policy owns all admission decisions.
import { spawnSync } from 'node:child_process';
import {
  runSourceAdmission,
  SOURCE_ADMISSION_SCHEMA,
} from '../lib/source-admission-policy.mjs';

function requestWithGh(path, { deadlineMs }) {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new Error('admission deadline exceeded');
  // Keep authentication in the existing gh shim. No token extraction or new identity.
  const result = spawnSync(
    'gh',
    ['api', '--method', 'GET', '--include', path],
    {
      encoding: 'utf8',
      timeout: Math.min(10_000, remaining),
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0)
    throw new Error('gh evidence unavailable');
  const separator = /\r?\n\r?\n/.exec(result.stdout);
  if (!separator) throw new Error('incomplete HTTP response');
  const lines = result.stdout.slice(0, separator.index).split(/\r?\n/);
  if (!/^HTTP\/\S+ 200(?:\s|$)/.test(lines.shift()))
    throw new Error('unexpected HTTP status');
  const headers = new Map();
  for (const line of lines) {
    const match = /^([^:\s]+):\s*(.*)$/.exec(line);
    if (!match) throw new Error('malformed HTTP header');
    const key = match[1].toLowerCase();
    if (headers.has(key)) throw new Error('ambiguous HTTP header');
    headers.set(key, match[2]);
  }
  return {
    data: JSON.parse(
      result.stdout.slice(separator.index + separator[0].length)
    ),
    link: headers.get('link') ?? null,
  };
}

try {
  const [repository, number, expectedHead, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('unexpected arguments');
  const receipt = await runSourceAdmission({
    repository,
    prNumber: Number(number),
    expectedHead,
    // Required transport marker, never sent as a credential or HTTP header.
    token: 'existing-gh-request-transport',
    request: requestWithGh,
  });
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.allowed ? 0 : 1;
} catch (error) {
  console.log(
    JSON.stringify({
      schema: SOURCE_ADMISSION_SCHEMA,
      allowed: false,
      blockers: ['evidence-unavailable'],
      error: error.message,
    })
  );
  process.exitCode = 1;
}
