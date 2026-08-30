import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EVAL_PATH = join(
  process.cwd(),
  '../..',
  'docs/evaluations/newsjack-evaluation.md'
);
const PINNED_SHA = 'e3711a3305ff6faadea92a632aec130dddc9503b';

describe('newsjack evaluation (JOV-5469)', () => {
  it('pins Newsjack and records adopt-native provenance controls', () => {
    expect(existsSync(EVAL_PATH)).toBe(true);
    const doc = readFileSync(EVAL_PATH, 'utf8');
    expect(doc).toContain('JOV-5469');
    expect(doc).toContain(PINNED_SHA);
    expect(doc).toContain('elvisun/newsjack');
    expect(doc).toContain('MIT');
    expect(doc).toContain('Trademark');
    expect(doc).toContain('newsjack.sh');
    expect(doc).toContain('SBOM');
    expect(doc).toContain('playwright-core');
    expect(doc).toContain('Update policy');
    expect(doc).toContain('no auto-update');
    expect(doc).toContain('Provenance controls');
    expect(doc).toContain('safeFetchPublicHtml');
    expect(doc).toContain('inspectPressSource');
    expect(doc).toContain('Do not vendor or execute Newsjack');
    expect(doc).toContain('no new runtime dependency');
    expect(doc).toContain('Verdict Summary');
  });
});
