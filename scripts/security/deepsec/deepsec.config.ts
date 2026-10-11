import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
// Founder decision: scanners use native subscriptions. No Gateway key or
// paid-provider fallback belongs in this workspace; admission must verify
// the native CLI's subscription login before starting a scan.
// A plain object: deepsec's defineConfig is an identity helper, and importing
// it would make repo typechecks depend on the scanner's node_modules.
export default {
  ai: { mode: 'local', provider: 'local' },
  defaultAgent: 'codex',
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
};
