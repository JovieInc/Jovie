import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { release, validateReleaseTarget } from '../scripts/jovie-release.mjs';

const binding = {
  deploymentId: 'dpl_synthetic',
  sha: 'a'.repeat(40),
  projectId: 'prj_jovie_agent',
  teamId: 'team_product',
};
const deployment = {
  id: binding.deploymentId,
  readyState: 'READY',
  target: 'production',
  projectId: binding.projectId,
  teamId: binding.teamId,
  meta: { githubCommitSha: binding.sha },
  url: 'jovie-agent-synthetic.vercel.app',
};
describe('independent release and rollback', () => {
  it('accepts only exact project, team, revision and READY deployment', () => {
    expect(validateReleaseTarget(deployment, binding)).toBe(
      'https://jovie-agent-synthetic.vercel.app'
    );
    for (const override of [
      { id: 'dpl_other' },
      { target: 'preview' },
      { readyState: 'BUILDING' },
      { projectId: 'prj_company' },
      { teamId: 'team_other' },
      { meta: { githubCommitSha: 'b'.repeat(40) } },
      { url: 'attacker.example' },
    ])
      expect(() =>
        validateReleaseTarget({ ...deployment, ...override }, binding)
      ).toThrow();
    expect(() =>
      validateReleaseTarget(deployment, { ...binding, deploymentId: '' })
    ).toThrow();
    expect(() =>
      validateReleaseTarget(deployment, { ...binding, sha: '' })
    ).toThrow();
    expect(() =>
      validateReleaseTarget(deployment, { ...binding, projectId: '' })
    ).toThrow();
    expect(() =>
      validateReleaseTarget(deployment, { ...binding, teamId: '' })
    ).toThrow();
  });
  it.each([
    'preview',
    'candidate',
  ])('builds a %s without assigning domains', async operation => {
    const cwd = process.cwd();
    const directory = mkdtempSync(join(tmpdir(), 'jovie-release-'));
    try {
      process.chdir(directory);
      const environment = {
        OPERATION: operation,
        EXPECTED_SHA: binding.sha,
        JOVIE_AGENT_VERCEL_TOKEN: 'synthetic',
        JOVIE_AGENT_VERCEL_PROJECT_ID: binding.projectId,
        JOVIE_AGENT_VERCEL_TEAM_ID: binding.teamId,
      };
      const run = vi
        .fn()
        .mockReturnValue('https://jovie-agent-synthetic.vercel.app');
      expect((await release(environment, run)).status).toBe(
        'deployed-uncommissioned'
      );
      expect(run.mock.calls[0][1].includes('--skip-domain')).toBe(
        operation === 'candidate'
      );
      expect(run.mock.calls[0][1]).not.toContain('promote');
      await expect(
        release(environment, vi.fn().mockReturnValue('https://other.example'))
      ).rejects.toThrow('URL unavailable');
    } finally {
      process.chdir(cwd);
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    'promote',
    'rollback',
  ])('uses the same exact revision gate for %s', async operation => {
    const run = vi.fn().mockReturnValue('');
    const fetcher = vi.fn().mockResolvedValue(Response.json(deployment));
    const receipt = await release(
      {
        OPERATION: operation,
        EXPECTED_SHA: binding.sha,
        DEPLOYMENT_ID: binding.deploymentId,
        JOVIE_AGENT_VERCEL_TOKEN: 'synthetic',
        JOVIE_AGENT_VERCEL_PROJECT_ID: binding.projectId,
        JOVIE_AGENT_VERCEL_TEAM_ID: binding.teamId,
      },
      run,
      fetcher
    );
    expect(receipt.status).toBe(
      'promotion-requested-requires-runtime-readback'
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][1]).toContain(binding.deploymentId);
  });
  it('fails before invoking a provider without scoped credentials', async () => {
    const run = vi.fn();
    await expect(release({}, run)).rejects.toThrow('binding unavailable');
    expect(run).not.toHaveBeenCalled();
  });
  it('never promotes a company deployment or failed verification', async () => {
    const run = vi.fn();
    const environment = {
      OPERATION: 'rollback',
      EXPECTED_SHA: binding.sha,
      DEPLOYMENT_ID: binding.deploymentId,
      JOVIE_AGENT_VERCEL_TOKEN: 'synthetic',
      JOVIE_AGENT_VERCEL_PROJECT_ID: binding.projectId,
      JOVIE_AGENT_VERCEL_TEAM_ID: binding.teamId,
    };
    await expect(
      release(
        environment,
        run,
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ ...deployment, projectId: 'prj_company' })
          )
      )
    ).rejects.toThrow();
    await expect(
      release(
        environment,
        run,
        vi.fn().mockResolvedValue(new Response('', { status: 403 }))
      )
    ).rejects.toThrow('verification unavailable');
    await expect(
      release({ ...environment, DEPLOYMENT_ID: '../x' }, run)
    ).rejects.toThrow('ID unavailable');
    expect(run).not.toHaveBeenCalled();
  });
});

it('redacts credential-bearing CLI failures without a provider call', () => {
  const result = spawnSync(process.execPath, ['scripts/jovie-release.mjs'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      OPERATION: 'invalid',
      SUMMER_VERCEL_TOKEN: 'synthetic-private-sentinel',
      JOVIE_AGENT_VERCEL_TOKEN: 'synthetic-private-sentinel',
    },
    timeout: 5000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('release-failed');
  expect(result.stderr).not.toContain('synthetic-private-sentinel');
});
