import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { LANE_COMMANDS, LANE_GROUPS } from './ci-fast-lanes.mjs';
import {
  COMPONENT_REGISTRY_PATH,
  LOCK_PROFILE_PATH,
  loadAndValidate,
  MANIFEST_PATH,
  validateDesignConformance,
} from './design-conformance-check.mjs';
import {
  classifyDesignPath,
  selectDesignConformanceChecks,
} from './design-conformance-paths.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), 'utf8'));
}

function fixture() {
  return {
    repoRoot: REPO_ROOT,
    manifest: readJson(MANIFEST_PATH),
    lockProfiles: readJson(LOCK_PROFILE_PATH),
    componentRegistrySource: readFileSync(
      resolve(REPO_ROOT, COMPONENT_REGISTRY_PATH),
      'utf8'
    ),
  };
}

function issueCodes(input) {
  return validateDesignConformance(input).map(issue => issue.code);
}

test('the committed manifest satisfies the fail-closed contract', () => {
  assert.deepEqual(loadAndValidate(REPO_ROOT), []);
});

test('canonical authority cannot read or write live Pen and must match the lock profile', () => {
  const input = fixture();
  input.manifest.authority.canonicalPath = '/tmp/copied.pen';
  input.manifest.authority.ciReadsLivePen = true;
  input.manifest.authority.penWritesAllowed = true;

  const codes = issueCodes(input);
  assert.ok(codes.includes('canonical-path-mismatch'));
  assert.ok(codes.includes('live-pen-read-forbidden'));
  assert.ok(codes.includes('pen-write-forbidden'));
});

test('founder-locked state fails closed without a verified Pen export and receipt', () => {
  const input = fixture();
  input.manifest.components[0].state = 'founder-locked';

  assert.ok(issueCodes(input).includes('unverified-founder-lock'));
});

test('source changes require an explicit source digest revision', () => {
  const input = fixture();
  input.manifest.components[0].sourceDigest = '0'.repeat(64);

  assert.ok(issueCodes(input).includes('source-digest-drift'));
});

test('legacy Pen debt is shrink-only and cannot admit a new unresolved component', () => {
  const input = fixture();
  input.manifest.legacy.unboundComponentIds.push('atom.new-unbound');
  input.manifest.legacy.unboundComponentIds.sort();
  input.componentRegistrySource = input.componentRegistrySource.replace(
    '] as const satisfies',
    `  {\n    id: 'atom.new-unbound',\n    layer: 'atom',\n    source: 'packages/ui/atoms/link.tsx',\n    exportName: 'Link',\n    storySource: 'packages/ui/atoms/link.stories.tsx',\n    storybookTitle: 'shadcn/Link',\n    storyExport: 'Default',\n    testSources: ['packages/ui/atoms/link.test.tsx'],\n    dependsOn: [],\n    penRootId: null,\n    referenceEligible: false,\n    penIdentityReason: 'fixture',\n    variantAxes: {},\n  },\n] as const satisfies`
  );

  assert.ok(issueCodes(input).includes('legacy-debt-increase'));
});

test('registry growth fails until the component is explicitly bound or ratcheted', () => {
  const input = fixture();
  input.componentRegistrySource = input.componentRegistrySource.replace(
    '] as const satisfies',
    `  {\n    id: 'atom.new-bound',\n    layer: 'atom',\n    source: 'packages/ui/atoms/link.tsx',\n    exportName: 'Link',\n    storySource: 'packages/ui/atoms/link.stories.tsx',\n    storybookTitle: 'shadcn/Link',\n    storyExport: 'Default',\n    testSources: ['packages/ui/atoms/link.test.tsx'],\n    dependsOn: [],\n    penRootId: null,\n    referenceEligible: false,\n    penIdentityReason: 'fixture',\n    variantAxes: {},\n  },\n] as const satisfies`
  );

  assert.ok(issueCodes(input).includes('untracked-registry-component'));
});

test('declared component IDs cannot evade the normalized registry parser', () => {
  const input = fixture();
  input.componentRegistrySource = input.componentRegistrySource.replace(
    '] as const;\n\nexport type DesignSystemComponentId',
    "  'atom.hidden',\n] as const;\n\nexport type DesignSystemComponentId"
  );

  const codes = issueCodes(input);
  assert.ok(codes.includes('registry-id-contract-mismatch'));
  assert.ok(codes.includes('untracked-registry-component'));
});

test('duplicate component and Pen identities fail closed', () => {
  const input = fixture();
  input.manifest.components.push({ ...input.manifest.components[0] });

  const codes = issueCodes(input);
  assert.ok(codes.includes('duplicate-component-id'));
  assert.ok(codes.includes('duplicate-pen-root'));
});

test('design path selection covers web, native, motion, and governance surfaces', () => {
  const selected = selectDesignConformanceChecks([
    'apps/web/app/(marketing)/page.tsx',
    'apps/web/components/jovie/ChatAnalyticsCard.tsx',
    'apps/web/styles/design-system.css',
    'packages/ui/theme/tokens.ts',
    'apps/ios/Jovie/DesignSystem/JovieTheme.swift',
    'apps/macos/MenuMonitor/Sources/MenuMonitor/MenuMonitorApp.swift',
    'packages/hyperframes/templates/metric-card.html',
    MANIFEST_PATH,
  ]);

  assert.equal(selected.applicable, true);
  assert.deepEqual(selected.domains, [
    'governance',
    'ios',
    'macos',
    'motion',
    'web',
  ]);
  assert.equal(selected.ubuntuOperationsAffected, false);
  assert.deepEqual(selected.invalidPaths, []);
});

test('ordinary iOS UI changes select the design gate without Ubuntu operations', () => {
  const selected = selectDesignConformanceChecks([
    'apps/ios/Jovie/Features/Dashboard/DashboardView.swift',
  ]);

  assert.equal(selected.applicable, true);
  assert.deepEqual(selected.domains, ['ios']);
  assert.equal(selected.ubuntuOperationsAffected, false);
  assert.ok(LANE_GROUPS.remaining.includes('design-conformance'));
  assert.equal(
    LANE_COMMANDS['design-conformance'],
    'pnpm design:conformance:gate'
  );
  assert.doesNotMatch(
    LANE_COMMANDS['design-conformance'],
    /backlog|hermes|symphony|systemd/i
  );
});

test('Ubuntu operation paths remain disjoint from design selection', () => {
  const selected = selectDesignConformanceChecks([
    'scripts/backlog-orchestrator/admitter.mjs',
    'scripts/hermes/systemd/symphony-ui-pilot.service',
  ]);

  assert.equal(selected.applicable, false);
  assert.equal(selected.ubuntuOperationsAffected, true);
});

test('manifest policy arrays are exact v1 contracts rather than editable labels', () => {
  const input = fixture();
  input.manifest.policy.allowedStates = ['source-bound'];
  input.manifest.policy.founderLockedRequires = ['source-digest'];

  const codes = issueCodes(input);
  assert.ok(codes.includes('invalid-state-policy'));
  assert.ok(codes.includes('invalid-founder-lock-policy'));
});

test('component evidence cannot escape the tracked repository boundary', () => {
  const input = fixture();
  input.manifest.components[0].contractSource = '../../etc/passwd';

  assert.ok(issueCodes(input).includes('missing-source-evidence'));
});

test('manifest Pen roots must match their source contract', () => {
  const input = fixture();
  input.manifest.components[0].penRootId = 'differentRoot';

  assert.ok(issueCodes(input).includes('contract-pen-root-mismatch'));
});

test('family-map Button bindings count as a Pen root and reject the retired scalar', () => {
  const input = fixture();
  assert.equal(
    issueCodes(input).includes('registry-pen-binding-missing'),
    false
  );
  input.manifest.components[0].penRootId = 'L2SRKu';
  assert.ok(issueCodes(input).includes('contract-pen-root-mismatch'));
});

test('unsafe or ambiguous changed paths fail selector validation', () => {
  assert.equal(classifyDesignPath('../copied.pen').valid, false);
  assert.equal(classifyDesignPath('/absolute/file.swift').valid, false);
  assert.deepEqual(
    selectDesignConformanceChecks(['../copied.pen']).invalidPaths,
    ['../copied.pen']
  );
});

test('malformed changed-file input fails closed without a stack trace', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(REPO_ROOT, 'scripts/design-conformance-check.mjs')],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DESIGN_CONFORMANCE_CHANGED_FILES: '{not-json}',
      },
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Design conformance failed closed:/);
  assert.doesNotMatch(result.stderr, /at JSON\.parse|SyntaxError:/);
});
