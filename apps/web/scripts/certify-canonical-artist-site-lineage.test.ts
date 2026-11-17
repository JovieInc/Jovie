import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CanonicalArtistSiteCliOptions } from './certify-canonical-artist-site';
import { certifyCanonicalArtistSite } from './certify-canonical-artist-site';
import { classifyDeployedRevisionFromGit } from './certify-canonical-artist-site-lineage';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('quota-deferred lineage: an empty history read is not a product verdict', () => {
  // The Golden Path shell pre-creates the source-history file and clears it
  // only when a commits-history page fails (e.g. a GitHub installation-quota
  // 403 on 2026-11-12 run 43314623730). Empty evidence must end as an honest
  // quota deferral, never as a RED "live revision is not <sha>" verdict.
  const source = 'a'.repeat(40);
  const deployed = 'f'.repeat(40);

  const deferredFixture = (
    overrides: Partial<CanonicalArtistSiteCliOptions>
  ): CanonicalArtistSiteCliOptions => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-quota-deferred-'));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, 'm2.json'),
      JSON.stringify({
        steps: [
          { name: 'claim', ok: true },
          { name: 'pro_checkout_199', ok: true },
          { name: 'activation', ok: true },
        ],
      })
    );
    writeFileSync(
      join(directory, 'profile-report.json'),
      JSON.stringify({ snapshot: { releaseSha: deployed } })
    );
    writeFileSync(
      join(directory, 'profile-result.json'),
      JSON.stringify({
        reportPath: join(directory, 'profile-report.json'),
        failed: false,
      })
    );
    return {
      candidateId: 'acquisition:premade-artist-profile:tim-white:test',
      runId: 'test-1',
      sourceRevision: source,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      goldenPathStatus: 'success',
      claimContractStatus: 'success',
      waitlistStatus: 'success',
      m2Status: 'success',
      m2ReceiptPath: join(directory, 'm2.json'),
      profileStatus: 'success',
      profileResultPath: join(directory, 'profile-result.json'),
      outputPath: join(directory, 'certificate.json'),
      gitRoot: directory,
      ...overrides,
    };
  };

  it('reports a visible quota deferral instead of issuing a false GREEN or a red step', () => {
    // JOV-12646: the deferral is a transport state. The certificate stays RED
    // (nothing certifies on an unbound revision) and every binding-affected
    // receipt carries the github-quota-deferred detail the CLI turns into a
    // visible warning with exit 0, so Golden Path (manual) does not go red.
    const certificate = certifyCanonicalArtistSite(
      deferredFixture({ lineageFileEmpty: true, sourceHistory: [] })
    );
    expect(certificate.status).toBe('RED');
    expect(certificate.safeToSend).toBe(false);
    const deferredRows = certificate.checks.filter(check =>
      check.detail.startsWith('github-quota-deferred:')
    );
    expect(deferredRows.length).toBeGreaterThan(0);
    for (const row of deferredRows) {
      expect(row.detail).toContain('not a product verdict');
      expect(row.detail).toContain('Re-run after the quota resets');
    }
  });

  it('keeps a real drift verdict when the history file has content', () => {
    const certificate = certifyCanonicalArtistSite(
      deferredFixture({ lineageFileEmpty: false, sourceHistory: [source] })
    );
    expect(certificate.status).toBe('RED');
    expect(certificate.failingChecks.map(check => check.id)).toContain(
      'identity_catalog'
    );
  });

  it('still binds an equal SHA even when the history file is empty', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-quota-deferred-'));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, 'm2.json'),
      JSON.stringify({
        steps: [
          { name: 'claim', ok: true },
          { name: 'pro_checkout_199', ok: true },
          { name: 'activation', ok: true },
        ],
      })
    );
    writeFileSync(
      join(directory, 'profile-report.json'),
      JSON.stringify({ snapshot: { releaseSha: source }, failed: false })
    );
    writeFileSync(
      join(directory, 'profile-result.json'),
      JSON.stringify({
        reportPath: join(directory, 'profile-report.json'),
        failed: false,
      })
    );
    const certificate = certifyCanonicalArtistSite({
      candidateId: 'acquisition:premade-artist-profile:tim-white:test',
      runId: 'test-1',
      sourceRevision: source,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      goldenPathStatus: 'success',
      claimContractStatus: 'success',
      waitlistStatus: 'success',
      m2Status: 'success',
      m2ReceiptPath: join(directory, 'm2.json'),
      profileStatus: 'success',
      profileResultPath: join(directory, 'profile-result.json'),
      outputPath: join(directory, 'certificate.json'),
      gitRoot: directory,
      lineageFileEmpty: true,
      sourceHistory: [],
    });
    expect(existsSync(join(directory, 'certificate.json'))).toBe(true);
    expect(certificate.failingChecks.map(check => check.id)).not.toContain(
      'identity_catalog'
    );
  });

  it('keeps a real RED when the profile itself failed, even on empty lineage', () => {
    const certificate = certifyCanonicalArtistSite(
      deferredFixture({
        lineageFileEmpty: true,
        sourceHistory: [],
        profileStatus: 'failure',
      })
    );
    expect(certificate.status).toBe('RED');
    expect(certificate.failingChecks.map(check => check.id)).toContain(
      'identity_catalog'
    );
  });
});

describe('git-path lineage binding (JOV-12646)', () => {
  const git = (root: string, args: readonly string[]) =>
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();

  /** A two-commit repo: rootSha (deployed) is an ancestor of childSha (source). */
  function gitRepo() {
    const root = mkdtempSync(join(tmpdir(), 'jovie-gp-git-'));
    temporaryDirectories.push(root);
    git(root, ['init', '--quiet', '--initial-branch', 'main']);
    git(root, ['config', 'user.email', 'golden-path@example.com']);
    git(root, ['config', 'user.name', 'Golden Path']);
    writeFileSync(join(root, 'a.txt'), 'a');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '--quiet', '-m', 'a']);
    const rootSha = git(root, ['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'b.txt'), 'b');
    git(root, ['add', 'b.txt']);
    git(root, ['commit', '--quiet', '-m', 'b']);
    const childSha = git(root, ['rev-parse', 'HEAD']);
    return { root, rootSha, childSha };
  }

  it('binds an equal revision and an ancestor from the checkout without the commits API', () => {
    const repo = gitRepo();
    expect(
      classifyDeployedRevisionFromGit(repo.root, repo.childSha, repo.childSha)
    ).toBe('same');
    expect(
      classifyDeployedRevisionFromGit(repo.root, repo.childSha, repo.rootSha)
    ).toBe('ancestor');
  });

  it('reports real drift when both revisions exist but diverged', () => {
    const repo = gitRepo();
    git(repo.root, ['switch', '--quiet', '--orphan', 'other']);
    writeFileSync(join(repo.root, 'c.txt'), 'c');
    git(repo.root, ['add', 'c.txt']);
    git(repo.root, ['commit', '--quiet', '-m', 'c']);
    const orphanSha = git(repo.root, ['rev-parse', 'HEAD']);
    expect(
      classifyDeployedRevisionFromGit(repo.root, repo.childSha, orphanSha)
    ).toBe('unrelated');
  });

  it('answers unanswered for a revision the checkout cannot supply', () => {
    const repo = gitRepo();
    const missing = 'f'.repeat(40);
    expect(
      classifyDeployedRevisionFromGit(repo.root, repo.childSha, missing)
    ).toBe('unanswered');
  });

  it('certifies the binding from git even when the lineage file is empty', () => {
    const repo = gitRepo();
    const directory = mkdtempSync(join(tmpdir(), 'jovie-gp-git-cert-'));
    temporaryDirectories.push(directory);
    const m2ReceiptPath = join(directory, 'm2.json');
    const profileReportPath = join(directory, 'profile-report.json');
    const profileResultPath = join(directory, 'profile-result.json');
    const historyPath = join(directory, 'source-history.txt');
    writeFileSync(
      m2ReceiptPath,
      JSON.stringify({
        steps: [
          { name: 'claim', ok: true },
          { name: 'pro_checkout_199', ok: true },
          { name: 'activation', ok: true },
        ],
      })
    );
    writeFileSync(
      profileReportPath,
      JSON.stringify({
        snapshot: { releaseSha: repo.rootSha },
        linkChecks: [
          {
            url: 'https://jov.ie/tim/never-say-a-word',
            status: 200,
            canonicalArtistReturn: true,
          },
        ],
      })
    );
    writeFileSync(
      profileResultPath,
      JSON.stringify({
        failed: false,
        reportPath: profileReportPath,
        exposedDeferredSurfaces: [],
        checks: [],
        brokenInternalLinks: [],
      })
    );
    writeFileSync(historyPath, '');
    const certificate = certifyCanonicalArtistSite({
      candidateId: 'acquisition:premade-artist-profile:tim-white:run-42',
      runId: 'run-42',
      sourceRevision: repo.childSha,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/42',
      goldenPathStatus: 'success',
      claimContractStatus: 'success',
      waitlistStatus: 'success',
      m2Status: 'success',
      m2ReceiptPath,
      profileStatus: 'success',
      navigationStatus: 'success',
      profileResultPath,
      outputPath: join(directory, 'certificate.json'),
      gitRoot: repo.root,
      sourceHistory: [],
      lineageFileEmpty: true,
    });
    expect(certificate.status).toBe('GREEN');
  });

  it('keeps real drift RED from git even when the lineage file is empty', () => {
    const repo = gitRepo();
    git(repo.root, ['switch', '--quiet', '--orphan', 'other']);
    writeFileSync(join(repo.root, 'c.txt'), 'c');
    git(repo.root, ['add', 'c.txt']);
    git(repo.root, ['commit', '--quiet', '-m', 'c']);
    const orphanSha = git(repo.root, ['rev-parse', 'HEAD']);
    const directory = mkdtempSync(join(tmpdir(), 'jovie-gp-git-drift-'));
    temporaryDirectories.push(directory);
    const m2ReceiptPath = join(directory, 'm2.json');
    const profileReportPath = join(directory, 'profile-report.json');
    const profileResultPath = join(directory, 'profile-result.json');
    const historyPath = join(directory, 'source-history.txt');
    writeFileSync(
      m2ReceiptPath,
      JSON.stringify({
        steps: [
          { name: 'claim', ok: true },
          { name: 'pro_checkout_199', ok: true },
          { name: 'activation', ok: true },
        ],
      })
    );
    writeFileSync(
      profileReportPath,
      JSON.stringify({
        snapshot: { releaseSha: orphanSha },
        linkChecks: [
          {
            url: 'https://jov.ie/tim/never-say-a-word',
            status: 200,
            canonicalArtistReturn: true,
          },
        ],
      })
    );
    writeFileSync(
      profileResultPath,
      JSON.stringify({
        failed: false,
        reportPath: profileReportPath,
        exposedDeferredSurfaces: [],
        checks: [],
        brokenInternalLinks: [],
      })
    );
    writeFileSync(historyPath, '');
    const certificate = certifyCanonicalArtistSite({
      candidateId: 'acquisition:premade-artist-profile:tim-white:run-42',
      runId: 'run-42',
      sourceRevision: repo.childSha,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/42',
      goldenPathStatus: 'success',
      claimContractStatus: 'success',
      waitlistStatus: 'success',
      m2Status: 'success',
      m2ReceiptPath,
      profileStatus: 'success',
      navigationStatus: 'success',
      profileResultPath,
      outputPath: join(directory, 'certificate.json'),
      gitRoot: repo.root,
      sourceHistory: [],
      lineageFileEmpty: true,
    });
    expect(certificate.status).toBe('RED');
    expect(certificate.failingChecks).toContainEqual(
      expect.objectContaining({
        defectRef: 'canonical-artist-site-source-revision',
      })
    );
  });
});
