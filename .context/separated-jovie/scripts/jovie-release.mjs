import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateReleaseTarget(deployment, binding) {
  if (
    !/^dpl_[A-Za-z0-9]+$/u.test(binding.deploymentId ?? '') ||
    !/^[a-f0-9]{40}$/u.test(binding.sha ?? '') ||
    !binding.projectId ||
    !binding.teamId ||
    deployment.id !== binding.deploymentId ||
    deployment.projectId !== binding.projectId ||
    (deployment.teamId ?? deployment.ownerId) !== binding.teamId ||
    deployment.readyState !== 'READY' ||
    deployment.target !== 'production' ||
    deployment.meta?.githubCommitSha !== binding.sha ||
    !/^[a-z0-9-]+\.vercel\.app$/u.test(deployment.url ?? '')
  ) {
    throw new Error(
      'release target is not the exact reviewed Jovie deployment'
    );
  }
  return `https://${deployment.url}`;
}

export async function release(
  environment = process.env,
  run = execFileSync,
  fetcher = fetch
) {
  const operation = environment.OPERATION;
  const sha = environment.EXPECTED_SHA;
  const token = environment.JOVIE_AGENT_VERCEL_TOKEN;
  const projectId = environment.JOVIE_AGENT_VERCEL_PROJECT_ID;
  const teamId = environment.JOVIE_AGENT_VERCEL_TEAM_ID;
  if (
    !['preview', 'candidate', 'promote', 'rollback'].includes(operation) ||
    !/^[a-f0-9]{40}$/u.test(sha ?? '') ||
    !token ||
    !projectId ||
    !teamId
  )
    throw new Error('Jovie release binding unavailable');
  const vercel = args =>
    run('pnpm', ['exec', 'vercel', ...args, '--token', token], {
      encoding: 'utf8',
      timeout: 600000,
      env: {
        PATH: process.env.PATH,
        VERCEL_PROJECT_ID: projectId,
        VERCEL_ORG_ID: teamId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (operation === 'preview' || operation === 'candidate') {
    mkdirSync('.vercel', { recursive: true });
    writeFileSync(
      '.vercel/project.json',
      JSON.stringify({ projectId, orgId: teamId })
    );
    const url = vercel([
      'deploy',
      '--yes',
      ...(operation === 'candidate' ? ['--prod', '--skip-domain'] : []),
      '--meta',
      `githubCommitSha=${sha}`,
    ]).trim();
    if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/u.test(url))
      throw new Error('deployment URL unavailable');
    // Preview deployment never mutates aliases or commissioning state.
    return { operation, sha, url, status: 'deployed-uncommissioned' };
  }
  const deploymentId = environment.DEPLOYMENT_ID;
  if (!/^dpl_[A-Za-z0-9]+$/u.test(deploymentId ?? ''))
    throw new Error('deployment ID unavailable');
  const response = await fetcher(
    `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${encodeURIComponent(teamId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    }
  );
  if (!response.ok) throw new Error('deployment verification unavailable');
  const url = validateReleaseTarget(await response.json(), {
    deploymentId,
    sha,
    projectId,
    teamId,
  });
  vercel(['promote', deploymentId, '--yes']);
  return {
    operation,
    sha,
    deploymentId,
    url,
    status: 'promotion-requested-requires-runtime-readback',
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await release()));
  } catch {
    // Provider errors may include argv credentials. Never forward their text.
    console.error(
      'jovie-agent-release-failed: check protected release binding and exact target'
    );
    process.exitCode = 1;
  }
}
