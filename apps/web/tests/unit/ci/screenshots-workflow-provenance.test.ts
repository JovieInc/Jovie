import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/screenshots.yml');

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      (line.trim().startsWith('- name:') || line.trim().startsWith('- uses:'))
  );

  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function stepIndex(workflow: string, stepName: string): number {
  const index = workflow.indexOf(`- name: ${stepName}`);
  expect(index, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);
  return index;
}

function matchesLiteralDirectoryFilter(pattern: string, path: string): boolean {
  const recursiveSuffix = '/**';
  if (!pattern.endsWith(recursiveSuffix)) return false;

  const escapedPrefix = pattern.slice(0, -recursiveSuffix.length);
  if (/(^|[^\\])[*[\]!?+]/.test(escapedPrefix)) return false;

  const prefix = escapedPrefix.replace(/\\([*[\]!?+])/g, '$1');
  return path === prefix || path.startsWith(`${prefix}/`);
}

describe('Product Screenshots provenance cleanliness', () => {
  it('checks out full history so the exact push base is resolvable', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('fetch-depth: 0');
  });

  it('restores a clean source tree after the server starts and before capture', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const restore = getStepBlock(
      workflow,
      'Restore clean source tree for provenance'
    );

    expect(stepIndex(workflow, 'Start production server')).toBeLessThan(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    );
    expect(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    ).toBeLessThan(stepIndex(workflow, 'Capture exact marketing routes'));
    expect(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    ).toBeLessThan(stepIndex(workflow, 'Capture screenshot catalog'));

    expect(restore).toContain('working-directory: .');
    expect(restore).toContain('git status --porcelain --untracked-files=all');
    expect(restore).toContain('git checkout -- .');
    expect(restore).toContain('git clean -fd');
    expect(restore).not.toContain('git clean -fdx');
    expect(restore).not.toContain('git clean -ffdx');
    expect(restore).not.toMatch(/kill .*SCREENSHOT_SERVER/);
    expect(restore).toContain('exit 1');
  });

  it('binds exact marketing evidence to the production build and canonical sources', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = getStepBlock(workflow, 'Capture exact marketing routes');

    expect(capture).toContain('SCREENSHOT_BUILD_MODE: production');
    expect(workflow).toContain("- 'apps/web/data/marketing/**'");
    expect(workflow).toContain("- 'apps/web/lib/agent-os/visual-qa/**'");
    expect(workflow).toContain("- 'apps/web/tests/visual-qa/**'");
  });

  it('reruns when the screenshot producer or safe transport changes', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const producerPath of [
      '.github/actions/upload-safe-playwright-artifact/**',
      '.github/scripts/guard-playwright-artifacts.mjs',
      '.github/workflows/screenshots.yml',
      'apps/web/scripts/check-screenshot-catalog.ts',
      'apps/web/scripts/png-optimization.ts',
      'apps/web/scripts/stage-screenshot-catalog-transfer.ts',
    ]) {
      expect(workflow).toContain(`- '${producerPath}'`);
    }
  });

  it('certifies uploaded marketing captures through the trusted shipping gate', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const upload = getStepBlock(
      workflow,
      'Upload exact marketing route captures'
    );
    const certify = getStepBlock(workflow, 'Certify exact screen captures');

    expect(
      stepIndex(workflow, 'Upload exact marketing route captures')
    ).toBeLessThan(stepIndex(workflow, 'Certify exact screen captures'));
    expect(upload).toContain('id: marketing-captures');
    expect(certify).toContain(
      'node scripts/invariants/screen-certification.mjs'
    );
    expect(certify).toContain(
      'SCREEN_CERT_MARKETING_ARTIFACT: marketing-route-screenshots-${{ github.sha }}'
    );
    expect(certify).toContain(
      'SCREEN_CERT_ARTIFACT_ID: ${{ needs.generate.outputs.marketing-artifact-id }}'
    );
    expect(certify).toContain('SCREEN_CERT_DIFF_BASE');
    expect(certify).toContain(
      '--artifact-id=${{ needs.generate.outputs.profile-artifact-id }}'
    );
  });

  it('emits and certifies a source-bound public-profile browser proof', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = getStepBlock(
      workflow,
      'Capture public-profile screen proof'
    );
    const bind = getStepBlock(
      workflow,
      'Bind public-profile proof to producer provenance'
    );
    const upload = getStepBlock(workflow, 'Upload public-profile screen proof');
    const certify = getStepBlock(workflow, 'Certify exact screen captures');

    const profilePathFilter = workflow.match(
      /^\s+- '([^']*app\/\\\[username\\\][^']*)'$/m
    )?.[1];
    expect(profilePathFilter).toBe('apps/web/app/\\[username\\]/**');
    expect(
      matchesLiteralDirectoryFilter(
        profilePathFilter ?? '',
        'apps/web/app/[username]/page.tsx'
      )
    ).toBe(true);
    expect(
      matchesLiteralDirectoryFilter(
        profilePathFilter ?? '',
        'apps/web/app/u/page.tsx'
      )
    ).toBe(false);
    expect(
      matchesLiteralDirectoryFilter(
        profilePathFilter ?? '',
        'apps/web/app/username/page.tsx'
      )
    ).toBe(false);
    expect(workflow).toContain(
      'profile-artifact-id: ${{ steps.profile-proof.outputs.artifact-id }}'
    );
    expect(capture).toContain('public-profile-screen-proof.spec.ts');
    expect(bind).toContain('--screen=web.public-profile');
    expect(bind).toContain('--producer-job-id="$PRODUCER_JOB_ID"');
    expect(bind).toContain('if ! [[ "$PRODUCER_JOB_ID" =~ ^[1-9][0-9]*$ ]]');
    expect(bind).toContain('Could not resolve the current producer job ID.');
    expect(bind).toContain('exit 1');
    expect(upload).toContain('name: screen-browser-proof');
    expect(upload).toContain('screenshots/desktop.png');
    expect(upload).toContain('screenshots/mobile.png');
    expect(certify).toContain('--screen-id=web.public-profile');
    expect(certify).toContain('needs.generate.outputs.profile-artifact-id');
    expect(certify).toContain('SCREEN_CERT_DIFF_BASE');
    expect(
      stepIndex(workflow, 'Upload public-profile screen proof')
    ).toBeLessThan(stepIndex(workflow, 'Certify exact screen captures'));
  });

  it('still emits a blocked receipt when screenshot generation fails', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const certifyJob = workflow.slice(workflow.indexOf('\n  certify:'));

    expect(certifyJob).toContain('if: ${{ always() }}');
    expect(certifyJob).toContain('needs: generate');
    expect(certifyJob).toContain(
      '--artifact-id=${{ needs.generate.outputs.profile-artifact-id }}'
    );
    expect(certifyJob).toContain('mkdir -p .artifacts/screen-certification');
    expect(certifyJob).toContain(
      "if: always() && hashFiles('.artifacts/screen-certification/*.json') != ''"
    );
  });

  it('keeps trusted proof production independent from catalog publication', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const generateStart = workflow.indexOf('\n  generate:');
    const publishStart = workflow.indexOf('\n  publish:');
    const certifyStart = workflow.indexOf('\n  certify:');
    const generate = workflow.slice(generateStart, publishStart);
    const publish = workflow.slice(publishStart, certifyStart);

    expect(generateStart).toBeGreaterThanOrEqual(0);
    expect(publishStart).toBeGreaterThan(generateStart);
    expect(certifyStart).toBeGreaterThan(publishStart);
    expect(generate).toContain('name: Generate Screenshots');
    expect(generate).toContain(
      'name: Stage generated screenshot catalog for transfer'
    );
    expect(generate).toContain('Upload generated screenshot catalog');
    expect(generate).toMatch(
      /name: Upload generated screenshot catalog[\s\S]*?path: \.artifacts\/screenshot-catalog-transfer\//
    );
    expect(generate).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(generate).not.toContain('Create or update screenshot PR');
    expect(publish).toContain('name: Publish Screenshot Catalog');
    expect(publish).toContain('needs: generate');
    expect(publish).toContain('continue-on-error: true');
    expect(publish).toContain('Download generated screenshot catalog');
    expect(publish).toMatch(
      /name: Download generated screenshot catalog[\s\S]*?path: \./
    );
    expect(publish).toContain('Create or update screenshot PR');
    expect(publish).toContain('JOVIE_BOT_PRIVATE_KEY');
  });
});
