import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_LIST_PAGE,
  bindLiveProductionSha,
  buildGitFetchInvocation,
  changedPaths,
  evidenceArtifactName,
  evidenceListPath,
  projectInspectDeployment,
  unexpiredEvidenceRunIds,
} from '../../promotion-gate-ci.mjs';

const root = resolve(import.meta.dirname, '../../..');
const BASE = 'a'.repeat(40);
const CANDIDATE = 'b'.repeat(40);
const DEPLOYMENT = 'dpl_7Gu4wr3uUeGn8jkVhWFBq4Z6n5Xa';

const inspectDoc = (over = {}) => ({
  id: DEPLOYMENT,
  url: 'jovie-abc.vercel.app',
  readyState: 'READY',
  target: 'production',
  builds: [{ id: 'bld_1', output: 'x'.repeat(80) }],
  meta: { githubCommitSha: 'c'.repeat(40) },
  ...over,
});

const buildInfo = (over = {}) => ({
  commitSha: BASE,
  deploymentId: DEPLOYMENT,
  environment: 'production',
  ...over,
});

describe('inspect projection ignores the missing commit field', () => {
  it('keeps id, url, readyState, and target from printJson', () => {
    const projected = projectInspectDeployment(
      `status line\n${JSON.stringify(inspectDoc(), null, 2)}\n`
    );
    expect(projected).toEqual({
      id: DEPLOYMENT,
      url: 'jovie-abc.vercel.app',
      readyState: 'READY',
      target: 'production',
    });
  });

  it('accepts a > prefixed inspect body', () => {
    const projected = projectInspectDeployment(
      `> ${JSON.stringify(inspectDoc())}\n`
    );
    expect(projected?.id).toBe(DEPLOYMENT);
    expect(projected).not.toHaveProperty('builds');
    expect(projected).not.toHaveProperty('meta');
  });

  it('rejects a body that only has meta.githubCommitSha', () => {
    expect(
      projectInspectDeployment(
        JSON.stringify({ meta: { githubCommitSha: BASE } })
      )
    ).toBeNull();
  });
});

describe('live production SHA binds build-info to the inspect id', () => {
  it('returns the build-info SHA when the deployment matches', () => {
    expect(
      bindLiveProductionSha({
        inspect: projectInspectDeployment(JSON.stringify(inspectDoc())),
        buildInfo: buildInfo(),
      })
    ).toEqual({ sha: BASE, reason: '' });
  });

  it('fail-closes when build-info is empty, short, or a different deployment', () => {
    const inspect = projectInspectDeployment(JSON.stringify(inspectDoc()));
    expect(
      bindLiveProductionSha({ inspect, buildInfo: {} }).sha
    ).toBe('');
    expect(
      bindLiveProductionSha({
        inspect,
        buildInfo: buildInfo({ commitSha: 'abc' }),
      }).reason
    ).toContain('not 40 hex');
    expect(
      bindLiveProductionSha({
        inspect,
        buildInfo: buildInfo({ deploymentId: 'dpl_other' }),
      }).reason
    ).toContain('does not match');
    expect(
      bindLiveProductionSha({
        inspect: projectInspectDeployment(
          JSON.stringify(inspectDoc({ readyState: 'ERROR' }))
        ),
        buildInfo: buildInfo(),
      }).sha
    ).toBe('');
    expect(
      bindLiveProductionSha({
        inspect: projectInspectDeployment(
          JSON.stringify(inspectDoc({ target: 'preview' }))
        ),
        buildInfo: buildInfo(),
      }).sha
    ).toBe('');
  });

  it('prints the SHA and a visible error without failing the process', () => {
    const dir = mkdtempSync(join(tmpdir(), 'resolve-base-'));
    const inspect = join(dir, 'inspect.json');
    const info = join(dir, 'build-info.json');
    writeFileSync(inspect, JSON.stringify(inspectDoc()));
    writeFileSync(info, JSON.stringify(buildInfo()));
    const ok = spawnSync(
      'node',
      [
        'scripts/promotion-gate-ci.mjs',
        'resolve-base',
        '--inspect',
        inspect,
        '--build-info',
        info,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe(BASE);
    expect(ok.stderr).toContain(DEPLOYMENT);
    expect(ok.stderr).not.toContain('c'.repeat(40));

    writeFileSync(info, '');
    const blocked = spawnSync(
      'node',
      [
        'scripts/promotion-gate-ci.mjs',
        'resolve-base',
        '--inspect',
        inspect,
        '--build-info',
        info,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(blocked.status).toBe(0);
    expect(blocked.stdout.trim()).toBe('');
    expect(blocked.stderr).toContain('::error::');
  });
});

describe('release-range git fetch stays authenticated and out of argv', () => {
  it('puts the token in the config-env header only', () => {
    const token = 'ghs_secret_token_value';
    const plan = buildGitFetchInvocation(BASE, CANDIDATE, {
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      GH_TOKEN: token,
      PATH: '/usr/bin',
    });
    const rendered = plan.args.join(' ');
    expect(rendered).not.toContain(token);
    expect(rendered).not.toContain(plan.env.JOVIE_GIT_AUTH_HEADER);
    expect(plan.args).toContain(
      '--config-env=http.https://github.com/JovieInc/Jovie.git.extraheader=JOVIE_GIT_AUTH_HEADER'
    );
    expect(plan.args).toContain('https://github.com/JovieInc/Jovie.git');
    expect(plan.args.slice(-2)).toEqual([BASE, CANDIDATE]);
    expect(plan.env.JOVIE_GIT_AUTH_HEADER.startsWith('AUTHORIZATION: basic ')).toBe(
      true
    );
  });

  it('returns no paths when the checkout has no token', () => {
    expect(changedPaths(BASE, CANDIDATE, {})).toBeNull();
  });
});

describe('exact-candidate evidence lookup', () => {
  it('asks for one page of the SHA-named artifact', () => {
    expect(evidenceArtifactName(CANDIDATE)).toBe(`journey-evidence-${CANDIDATE}`);
    expect(evidenceListPath('JovieInc/Jovie', CANDIDATE)).toBe(
      `repos/JovieInc/Jovie/actions/artifacts?name=journey-evidence-${CANDIDATE}&per_page=${EVIDENCE_LIST_PAGE}`
    );
    expect(EVIDENCE_LIST_PAGE).toBe(100);
    expect(evidenceListPath('not a repo', CANDIDATE)).toBeNull();
  });

  it('keeps unexpired artifacts whose run head is the candidate', () => {
    const ids = unexpiredEvidenceRunIds(
      {
        artifacts: [
          {
            expired: true,
            created_at: '2026-10-22T18:00:00Z',
            workflow_run: { id: 3, head_sha: CANDIDATE },
          },
          {
            expired: false,
            created_at: '2026-10-22T17:00:00Z',
            workflow_run: { id: 2, head_sha: CANDIDATE },
          },
          {
            expired: false,
            created_at: '2026-10-22T19:00:00Z',
            workflow_run: { id: 9, head_sha: BASE },
          },
          {
            expired: false,
            created_at: '2026-10-22T18:30:00Z',
            workflow_run: { id: 4, head_sha: CANDIDATE },
          },
        ],
      },
      CANDIDATE
    );
    expect(ids).toEqual(['4', '2']);
  });
});
