/**
 * Serial runSourceGuards stub for Source Validation fixture archives.
 * Same run-all / first-failure contract as the real pool, without the
 * ci-fast-lanes closure the fixture does not ship.
 */
export const SOURCE_GUARD_POOL_SERIAL_STUB = `import { spawnSync } from 'node:child_process';
export async function runSourceGuards(guards = []) {
  let code = 0;
  for (const guard of guards) {
    const result = spawnSync(guard.command, {
      shell: true,
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    const status = result.status ?? 1;
    console.log(
      \`[source-guards] \${guard.id}: exit \${status}; duration_ms=0\`
    );
    if (status !== 0 && code === 0) code = status;
  }
  return { code, output: '' };
}
`;
