import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(process.cwd(), '../..');
const EVAL_PATH = join(
  REPO_ROOT,
  'docs/evaluations/cli-printing-press-evaluation.md'
);

// Guards the key decisions from #10929 (JOV-3204):
// 1. linear-pp-cli is ADOPTED for Eve (cost/speed lever)
// 2. Connector CLI generator is conditionally adopted for official APIs only
// 3. Unpublished API sniffing is BLOCKED until legal/product go-ahead
describe('cli-printing-press evaluation (GH #10929 / JOV-3204)', () => {
  it('evaluation document exists', () => {
    expect(
      existsSync(EVAL_PATH),
      `Missing: docs/evaluations/cli-printing-press-evaluation.md`
    ).toBe(true);
  });

  it('records the issue reference', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    expect(doc).toContain('#10929');
    expect(doc).toContain('JOV-3204');
  });

  it('documents the linear-pp-cli Eve adoption verdict', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    // Must capture the "Adopt" decision for the linear mirror route
    expect(doc).toContain('linear-pp-cli');
    expect(doc).toContain('Eve');
    // The key value claim: 50 ms compound queries
    expect(doc).toContain('50 ms');
  });

  it('documents the OWL connector CLI generator verdict', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    expect(doc).toContain('OWL');
    expect(doc).toContain('#10806');
    // Must mention official API gate
    expect(doc).toContain('official');
  });

  it('blocks unpublished API sniffing with explicit rationale', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    // Auth gate must be named — this is the non-obvious caveat that the tool does NOT solve
    expect(doc).toContain('auth');
    // ToS/ban risk must be documented
    expect(doc).toContain('ToS');
    // Apple Music for Artists must be called out as highest risk
    expect(doc).toContain('Apple Music for Artists');
    // Spotify for Artists sniffing must be blocked
    expect(doc).toContain('Spotify for Artists');
    // The block verdict must appear
    expect(doc).toContain('Block');
  });

  it('names the preferred official Spotify path over sniffing', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    // Must point agents toward the gated partner API, not the sniffed path
    expect(doc).toContain('Spotify');
    expect(doc).toContain('partner');
  });

  it('includes a verdict summary table', () => {
    const doc = readFileSync(EVAL_PATH, 'utf8');
    expect(doc).toContain('Verdict Summary');
  });
});
