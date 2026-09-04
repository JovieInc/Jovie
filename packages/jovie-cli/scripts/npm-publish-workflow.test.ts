import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/npm-publish.yml'),
  'utf8'
);

function assertPublishWorkflowContract(source: string): void {
  expect(source).toMatch(/^on:\n  workflow_dispatch:\s*$/m);
  expect(source).not.toMatch(
    /^\s+(push|pull_request|schedule|workflow_run|repository_dispatch):/m
  );
  expect(source).toMatch(/permissions:\n  contents: read/);
  expect(source).toMatch(/id-token: write/);
  expect(source).toMatch(/runs-on: ubuntu-latest/);
  expect(source).toContain('timeout-minutes: 25');
  expect(source).toContain(
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
  );
  expect(source).toContain(
    'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86'
  );
  expect(source).toContain(
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
  );
  expect(source).toMatch(/node-version-file: .nvmrc/);
  expect(source).toContain('registry-url: https://registry.npmjs.org');
  expect(source).toMatch(/node --version.*v22\.23\.2/s);
  expect(source).toContain('pnpm install --frozen-lockfile');
  expect(source).toContain('pnpm --filter @jovie/cli run test:coverage');
  expect(source).toContain('pnpm --filter @jovie/cli run typecheck');
  expect(source).toContain('pnpm --filter @jovie/cli run build');
  expect(source).toContain('pnpm --filter @jovie/cli run pack:dry');
  expect(source).toContain('test "$GITHUB_REF" = refs/heads/main');
  expect(source).toContain('git rev-parse origin/main');
  expect(
    source.match(/test "\$checked_out_sha" = "\$current_main_sha"/g)
  ).toHaveLength(2);
  expect(source).toContain(
    'Checkout drifted from current origin/main immediately before publication.'
  );
  expect(source).toContain("tr -d '[:space:]' < VERSION");
  expect(source).toContain(
    "manifest.repository?.url === 'git+https://github.com/JovieInc/Jovie.git'"
  );
  expect(source).toContain(
    "manifest.repository?.directory === 'packages/jovie-cli'"
  );
  expect(source).toContain('REGISTRY_URL: https://registry.npmjs.org');
  expect(source).toContain('--connect-timeout 10');
  expect(source).toContain('--max-time 30');
  expect(source).toContain('--retry 2');
  expect(source).toContain('--retry-delay 1');
  expect(source).toContain('--retry-max-time 40');
  expect(source).toContain('case "$registry_status" in');
  expect(source).toContain('404)');
  expect(source).toContain('200)');
  expect(source).toMatch(
    /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/
  );
  expect(source).not.toContain('NPM_CONFIG_USERCONFIG:');
  expect(source).toContain(
    'npm publish --provenance --access public "$PACKAGE_DIR"'
  );
  expect(source).toContain('- name: Prove public registry release');
  expect(source).toContain('for attempt in {1..12}');
  expect(source).toContain('metadata.dist?.attestations?.url');
  expect(source).toContain('metadata.dist?.attestations?.provenance');
  expect(source).toContain('Array.isArray(metadata.maintainers)');
  expect(source).toContain('npm access list collaborators "$PACKAGE_NAME"');
  expect(source).toContain(
    "Object.values(collaborators).includes('read-write')"
  );
  expect(source).toContain('"$PACKAGE_NAME@$RELEASE_VERSION"');
  expect(source).toContain('"$installed_cli" --version');
  expect(source).toContain('"$installed_cli" api openapi');
  expect(source).toContain("contract.info?.title !== 'Jovie Artist API'");
}

describe('manual npm provenance workflow', () => {
  it('locks the release workflow to the exact, tested, unpublished main package', () => {
    assertPublishWorkflowContract(workflow);
  });

  it.each([
    [
      'automatic trigger',
      workflow.replace(
        '  workflow_dispatch:\n',
        '  workflow_dispatch:\n  push:\n'
      ),
    ],
    [
      'provenance permission',
      workflow.replace('      id-token: write', '      id-token: read'),
    ],
    [
      'unpublished version guard',
      workflow.replace('            404)\n', '            204)\n'),
    ],
    [
      'provenance publish flag',
      workflow.replace('--provenance --access public', '--access public'),
    ],
    [
      'final current-main publication recheck',
      workflow.replace(
        '          test "$checked_out_sha" = "$current_main_sha" || {\n            echo "::error::Checkout drifted from current origin/main immediately before publication."\n            exit 1\n          }\n          npm publish',
        '          npm publish'
      ),
    ],
    [
      'publish auth config override',
      workflow.replace(
        '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}',
        '          NPM_CONFIG_USERCONFIG: ${{ github.workspace }}/.npmrc\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}'
      ),
    ],
    [
      'public provenance receipt',
      workflow.replace(
        "['dist.attestations.url', typeof metadata.dist?.attestations?.url === 'string']",
        "['dist.attestations.url', true]"
      ),
    ],
    [
      'fresh install runtime receipt',
      workflow.replace('"$installed_cli" api openapi', 'echo api openapi'),
    ],
  ])('fails closed when the %s is weakened', (_, unsafeWorkflow) => {
    expect(() => assertPublishWorkflowContract(unsafeWorkflow)).toThrow();
  });
});
