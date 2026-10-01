import { existsSync } from 'node:fs';
import path from 'node:path';

export function findRepoRoot(startDir: string): string {
  // Scoped AGENTS.md files also exist inside packages; the workspace marker
  // identifies the monorepo boundary for manifests and output paths.
  let dir = path.resolve(startDir);
  for (;;) {
    if (
      existsSync(path.join(dir, 'package.json')) &&
      existsSync(path.join(dir, 'pnpm-workspace.yaml'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Unable to locate repo root from ${startDir}`);
    }
    dir = parent;
  }
}
