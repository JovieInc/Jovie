// @vitest-environment node
/**
 * Actor ids for atomic DB operations must come from authenticated server
 * context (lib/db/legacy-transaction.ts). A request body or journey id used
 * as actorId lets a client pick the audit actor.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

const REQUEST_DERIVED =
  /actorId:\s*[^,}\n]*(parsed\.data|body\.|searchParams|headers\.get|acquisitionId)/;

describe('request-derived actorId guard', () => {
  it('flags the pattern it exists to catch', () => {
    expect(
      REQUEST_DERIVED.test('{ actorId: appUserId ?? acquisitionId }')
    ).toBe(true);
    expect(
      REQUEST_DERIVED.test("{ actorId: 'system:acquisition-capture' }")
    ).toBe(false);
  });

  it('no API route derives actorId from request input', () => {
    const offenders = routeFiles(path.join(process.cwd(), 'app', 'api'))
      .filter(file => REQUEST_DERIVED.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
