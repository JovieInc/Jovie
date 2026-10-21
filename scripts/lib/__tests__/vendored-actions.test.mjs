import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkVendored,
  loadManifest,
  VENDOR_ROOT,
  workflowPins,
} from '../../vendor-actions.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const composite = readFileSync(
  resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
  'utf8'
);

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'vendored-actions-'));
  for (const dir of ['.github/workflows', '.github/actions'])
    cpSync(resolve(repoRoot, dir), join(root, dir), { recursive: true });
  return root;
}

describe('vendored actions (JOV-8754)', () => {
  it('match the manifest byte for byte and the SHAs the workflows pin', () => {
    expect(checkVendored(repoRoot)).toEqual([]);
    const pins = workflowPins(repoRoot);
    for (const action of loadManifest(repoRoot).actions)
      expect(pins.get(action.repo), action.repo).toBe(action.sha);
  });

  it('serve the setup-node-pnpm composite with no remote nested pnpm or cache action', () => {
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/pnpm-action-setup'
    );
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/actions-cache/restore'
    );
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/actions-cache/save'
    );
    expect(composite).not.toMatch(/uses:\s+pnpm\/action-setup@/);
    expect(composite).not.toMatch(/uses:\s+actions\/cache(\/restore|\/save)?@/);
  });

  it('flags a tampered file, an unlisted file and a stale pin', () => {
    const root = sandbox();
    try {
      const [cache] = loadManifest(root).actions.filter(
        action => action.dir === 'actions-cache'
      );
      appendFileSync(
        join(root, VENDOR_ROOT, 'actions-cache/dist/restore-only/index.js'),
        '\n// tampered\n'
      );
      writeFileSync(join(root, VENDOR_ROOT, 'actions-cache/extra.js'), 'x');
      const workflow = join(root, '.github/workflows/zz-bump.yml');
      const bumped = `${'a'.repeat(40)}`;
      writeFileSync(
        workflow,
        Array.from(
          { length: 50 },
          (_, index) =>
            `# ${index}\n      - uses: actions/cache/restore@${bumped}\n`
        ).join('')
      );
      const problems = checkVendored(root);
      expect(problems).toContain(
        'actions-cache/dist/restore-only/index.js: hash mismatch'
      );
      expect(problems).toContain(
        '.github/actions/vendor/actions-cache/extra.js: not in manifest'
      );
      expect(
        problems.some(problem =>
          problem.startsWith(
            `actions-cache: vendored ${cache.repo}@${cache.sha} but workflows pin @${bumped}`
          )
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
