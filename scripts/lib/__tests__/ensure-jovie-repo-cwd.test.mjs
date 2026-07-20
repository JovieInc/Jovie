import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureJovieRepoCwd,
  resolveJovieRepoFromScript,
} from '../../hermes/lib/ensure-jovie-repo-cwd.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('ensure-jovie-repo-cwd', () => {
  const originalCwd = process.cwd();
  const originalRepoEnv = process.env.HERMES_JOVIE_REPO;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalRepoEnv === undefined) {
      delete process.env.HERMES_JOVIE_REPO;
    } else {
      process.env.HERMES_JOVIE_REPO = originalRepoEnv;
    }
  });

  it('resolveJovieRepoFromScript walks up from scripts/hermes/jobs', () => {
    const moduleUrl = `file://${join(
      REPO_ROOT,
      'scripts/hermes/jobs/ci-failure-monitor.ts'
    )}`;
    expect(resolveJovieRepoFromScript(moduleUrl)).toBe(REPO_ROOT);
  });

  it('ensureJovieRepoCwd chdirs from a non-repo cwd', () => {
    const outside = mkdtempSync(join(tmpdir(), 'hermes-cwd-'));
    process.chdir(outside);

    const moduleUrl = `file://${join(
      REPO_ROOT,
      'scripts/hermes/jobs/pr-stuck-monitor.ts'
    )}`;
    const repoRoot = ensureJovieRepoCwd(moduleUrl);

    expect(repoRoot).toBe(REPO_ROOT);
    expect(process.cwd()).toBe(REPO_ROOT);
  });

  it('ensureJovieRepoCwd prefers HERMES_JOVIE_REPO when set', () => {
    const override = mkdtempSync(join(tmpdir(), 'hermes-repo-override-'));
    process.env.HERMES_JOVIE_REPO = override;

    const moduleUrl = `file://${join(
      REPO_ROOT,
      'scripts/hermes/jobs/pr-stuck-monitor.ts'
    )}`;
    const repoRoot = ensureJovieRepoCwd(moduleUrl);

    expect(repoRoot).toBe(override);
    // macOS tmpdir is /var → /private/var; cwd reports the resolved path.
    expect(process.cwd()).toBe(realpathSync(override));
  });
});
