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

  it('checks production public exports before catalog capture', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const serving = getStepBlock(
      workflow,
      'Verify public screenshot exports from production build'
    );

    expect(
      stepIndex(
        workflow,
        'Verify public screenshot exports from production build'
      )
    ).toBeLessThan(stepIndex(workflow, 'Capture screenshot catalog'));
    expect(serving).toContain(
      'tests/product-screenshots/public-export-serving.spec.ts'
    );
    expect(serving).toContain('--config=playwright.config.screenshots.ts');
    expect(serving).toContain('--project=screenshots');
    expect(serving).toContain('BASE_URL: http://localhost:3000');
    expect(serving).toContain('SCREENSHOT_BUILD_MODE: production');
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
      'apps/web/scripts/sync-screenshot-public-export.ts',
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

  it('emits and certifies a source-bound /artists browser proof', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = getStepBlock(workflow, 'Capture /artists screen proof');
    const bind = getStepBlock(
      workflow,
      'Bind /artists proof to producer provenance'
    );
    const upload = getStepBlock(workflow, 'Upload /artists screen proof');
    const certify = getStepBlock(workflow, 'Certify exact screen captures');

    expect(workflow).toContain("- 'apps/web/app/artists/**'");
    expect(workflow).toContain(
      'artists-artifact-id: ${{ steps.artists-proof.outputs.artifact-id }}'
    );
    expect(capture).toContain('artists-screen-proof.spec.ts');
    expect(bind).toContain('--screen=web.artists');
    expect(bind).toContain('--producer-job-id="$PRODUCER_JOB_ID"');
    expect(bind).toContain('if ! [[ "$PRODUCER_JOB_ID" =~ ^[1-9][0-9]*$ ]]');
    expect(bind).toContain('Could not resolve the current producer job ID.');
    expect(bind).toContain('exit 1');
    expect(upload).toContain('name: screen-browser-proof-artists');
    expect(upload).toContain('screenshots/desktop.png');
    expect(upload).toContain('screenshots/mobile.png');
    expect(certify).toContain('--screen-id=web.artists');
    expect(certify).toContain('needs.generate.outputs.artists-artifact-id');
    expect(
      stepIndex(workflow, 'Capture public-profile screen proof')
    ).toBeLessThan(stepIndex(workflow, 'Capture /artists screen proof'));
    expect(stepIndex(workflow, 'Upload /artists screen proof')).toBeLessThan(
      stepIndex(workflow, 'Certify exact screen captures')
    );
    expect(stepIndex(workflow, 'Upload /artists screen proof')).toBeLessThan(
      stepIndex(
        workflow,
        'Verify public screenshot exports from production build'
      )
    );
  });

  it('emits and certifies a source-bound hud-isolated browser proof (JOV-7126)', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = getStepBlock(workflow, 'Capture hud-isolated screen proof');
    const bind = getStepBlock(
      workflow,
      'Bind hud-isolated proof to producer provenance'
    );
    const upload = getStepBlock(workflow, 'Upload hud-isolated screen proof');
    const certify = getStepBlock(workflow, 'Certify exact screen captures');

    expect(workflow).toContain("- 'apps/web/app/hud/**'");
    expect(workflow).toContain(
      'hud-isolated-artifact-id: ${{ steps.hud-isolated-proof.outputs.artifact-id }}'
    );
    // The secretless dev-test-auth admin bypass (JOV-7126) must be visible to
    // the long-lived production server process, which only ever reads the
    // job-level env (or its own step's env) — a later step's env cannot
    // reach an already-running server. It must be set before that server
    // starts.
    expect(workflow).toContain("E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH: '1'");
    expect(
      workflow.indexOf("E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH: '1'")
    ).toBeLessThan(stepIndex(workflow, 'Start production server'));
    expect(capture).toContain('hud-isolated-screen-proof.spec.ts');
    expect(bind).toContain('--screen=web.hud-isolated');
    expect(bind).toContain('--producer-job-id="$PRODUCER_JOB_ID"');
    // Each screen's proof gets its own GH artifact name (upload-artifact
    // forbids reusing another screen's name within this run).
    expect(upload).toContain('name: screen-browser-proof-hud-isolated');
    expect(upload).toContain('screenshots/desktop.png');
    expect(upload).toContain('screenshots/mobile.png');
    expect(certify).toContain('--screen-id=web.hud-isolated');
    expect(certify).toContain(
      'needs.generate.outputs.hud-isolated-artifact-id'
    );
    expect(stepIndex(workflow, 'Capture /artists screen proof')).toBeLessThan(
      stepIndex(workflow, 'Capture hud-isolated screen proof')
    );
    expect(
      stepIndex(workflow, 'Upload hud-isolated screen proof')
    ).toBeLessThan(stepIndex(workflow, 'Certify exact screen captures'));
    expect(
      stepIndex(workflow, 'Upload hud-isolated screen proof')
    ).toBeLessThan(
      stepIndex(
        workflow,
        'Verify public screenshot exports from production build'
      )
    );
  });

  it('pins the production server to a loopback hostname', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const start = getStepBlock(workflow, 'Start production server');

    // request.nextUrl.hostname reflects the server's own configured
    // hostname (Next.js passes it straight into startServer()), not the
    // incoming Host header — an unset/0.0.0.0 bind address makes every
    // request look like it came from "0.0.0.0", which
    // isLocalDevelopmentAutomationHostname (lib/security/development-only.ts)
    // correctly refuses to trust as a loopback client. That silently 403'd
    // the dev-test-auth bypass hud-isolated depends on. `next start` reads
    // the same HOSTNAME env var, so one job-env value covers both server
    // commands this step can run.
    expect(start).toContain('HOSTNAME: localhost');
    expect(start).not.toMatch(
      /HOSTNAME:\s*(0\.0\.0\.0|'0\.0\.0\.0'|"0\.0\.0\.0")/
    );
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
    // JOV-7126: a blocked receipt for an earlier --screen-id call must not
    // abort the shell before a later one runs, or that screen's evidence
    // silently never gets attempted.
    const certify = getStepBlock(workflow, 'Certify exact screen captures');
    expect(certify).toContain('|| STATUS=$?');
    expect(certify).toContain('exit "$STATUS"');
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
