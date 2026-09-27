import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'deepsec/config';

// Loaded only from the trusted scanner workspace. The scanned source is data:
// DEEPSEC_SOURCE_ROOT points at a checkout that is never installed or run.
const here = dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(join(here, 'policy.json'), 'utf8'));
const targets = JSON.parse(readFileSync(join(here, 'targets.json'), 'utf8'));

if (policy.execution.status !== 'advisory')
  throw new Error(
    'DeepSec is disabled by scripts/security/deepsec/policy.json'
  );
const root = process.env.DEEPSEC_SOURCE_ROOT;
if (!root) throw new Error('DEEPSEC_SOURCE_ROOT is required');
// Provider/env hygiene is enforced by deepsec-run.mjs, which starts deepsec
// with a minimal environment; deepsec itself sets the gateway route vars.
export default defineConfig({
  ai: { mode: 'gateway', provider: 'vercel' },
  dataDir: process.env.DEEPSEC_DATA_ROOT ?? join(here, 'data'),
  projects: [
    {
      id: policy.projectId,
      root,
      githubUrl: 'https://github.com/JovieInc/Jovie/blob/main',
      infoMarkdown: readFileSync(join(here, 'INFO.md'), 'utf8'),
      priorityPaths: targets.targets,
    },
  ],
});
