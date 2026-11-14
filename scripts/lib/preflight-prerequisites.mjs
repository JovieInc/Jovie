import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkInstallMatchesLockfile } from './preflight-install.mjs';

/** @param {{repo: string, env: NodeJS.ProcessEnv, list?: boolean}} input */
export function checkPrerequisites({ repo, env, list = false }) {
  const install = checkInstallMatchesLockfile({ repo });
  if (!install.ok || list) return install;
  const gh = spawnSync(
    'bash',
    [
      '-c',
      '. "$1"; jovie_setup_gh_api_slurp_ok',
      'preflight',
      fileURLToPath(new URL('./setup-worktree-health.sh', import.meta.url)),
    ],
    { cwd: repo, env, encoding: 'utf8' }
  );
  return gh.status === 0
    ? install
    : {
        ok: false,
        problems: ['GitHub CLI capability probe failed'],
        message: (
          gh.stderr ||
          gh.error?.message ||
          'GitHub CLI capability probe failed'
        ).trim(),
      };
}
