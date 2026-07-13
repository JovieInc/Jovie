import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAffectedTestPlan } from '../../run-affected-tests.mjs';

const runner = readFileSync(
  resolve(import.meta.dirname, '../../run-affected-tests.mjs'),
  'utf8'
);

const script = readFileSync(
  resolve(import.meta.dirname, '../../automation-verify.sh'),
  'utf8'
);

const PREREQUISITE_TRAIN_CORNERS = [
  'scripts/ci/neon-orphan-reaper.mjs',
  'apps/web/lib/testing/e2e-prebuilt-claim.ts',
  'apps/web/app/api/chat/onboarding-handler.ts',
  'apps/web/styles/design-system.css',
];
const PREREQUISITE_TRAIN_MANIFEST = [
  '.github/actions/neon-branch-cleanup/action.yml',
  '.github/actions/neon-create-branch-with-retry/action.yml',
  '.github/actions/neon-create-branch-with-retry/create-branch-with-capacity-retry.sh',
  '.github/actions/neon-create-branch-with-retry/create-branch.sh',
  '.github/workflows/ci.yml',
  '.github/workflows/e2e-full-matrix.yml',
  '.github/workflows/nightly-tests.yml',
  '.github/workflows/visual-regression.yml',
  'apps/web/app/api/chat/onboarding-handler.ts',
  'apps/web/app/api/dev/test-auth/session/route.ts',
  'apps/web/components/features/onboarding/OnboardingChat.tsx',
  'apps/web/components/jovie/components/ChatInput.tsx',
  'apps/web/components/organisms/SharedCommandPalette.tsx',
  'apps/web/lib/auth/dev-test-auth.server.ts',
  'apps/web/lib/testing/e2e-prebuilt-claim.ts',
  'apps/web/playwright.config.noauth.ts',
  'apps/web/styles/design-system.css',
  'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
  'apps/web/tests/e2e/golden-path.spec.ts',
  'apps/web/tests/helpers/auth.ts',
  'apps/web/tests/seed-test-data.ts',
  'apps/web/tests/unit/api/chat/onboarding-handler.test.ts',
  'apps/web/tests/unit/chat/chat-composer-system-b-style-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/ci/neon-endpoint-admission.test.ts',
  'apps/web/tests/unit/ci/visual-a11y-workflow.test.ts',
  'apps/web/tests/unit/e2e/auth-helper.test.ts',
  'apps/web/tests/unit/e2e/noauth-config.test.ts',
  'apps/web/tests/unit/e2e/seed-test-data.test.ts',
  'apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts',
  'apps/web/tests/unit/onboarding/OnboardingChat.turnstile.test.tsx',
  'scripts/ci/neon-orphan-reaper.mjs',
];
const PREREQUISITE_TRAIN_TESTS = [
  'apps/web/tests/unit/api/chat/onboarding-handler.test.ts',
  'apps/web/tests/unit/chat/chat-composer-system-b-style-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/ci/neon-endpoint-admission.test.ts',
  'apps/web/tests/unit/ci/visual-a11y-workflow.test.ts',
  'apps/web/tests/unit/e2e/auth-helper.test.ts',
  'apps/web/tests/unit/e2e/noauth-config.test.ts',
  'apps/web/tests/unit/e2e/seed-test-data.test.ts',
  'apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts',
  'apps/web/tests/unit/onboarding/OnboardingChat.turnstile.test.tsx',
];

describe('automation-verify affected scope', () => {
  it('selects related tests instead of the whole affected workspace package', () => {
    expect(script).toContain('node scripts/run-affected-tests.mjs');
    expect(script).not.toContain('turbo-local.mjs test --affected');
  });

  it('fails closed on an unresolved base and retains mandatory risk policy', () => {
    expect(script).toContain(
      'git rev-parse --verify --quiet "${BASE_REF}^{commit}"'
    );
    expect(script).toContain('pnpm ci:harness:check');
  });

  it('bounds local test fanout', () => {
    expect(script).toContain(
      '--max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"'
    );
  });

  it('keeps a #14044-like typography change bounded with required layout lanes', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/components/features/profile/ProfileHeroCard.tsx',
      'apps/web/components/jovie/components/ErrorDisplay.tsx',
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values.baseline.json',
      'CHANGELOG.md',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(4);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/profile/profile-layout-shift.test.tsx',
      'apps/web/tests/unit/profile/profile-card-layout.test.tsx',
      'apps/web/tests/unit/profile/profile-compact-surface-hero-layout.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts',
    ]);
    expect(plan.selectedTests).toHaveLength(5);
  });

  it('maps the seed confirmation boundary diff to focused behavior tests', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/lib/events/confirmation-status.ts',
      'apps/web/lib/events/insert.ts',
      'apps/web/tests/seed-test-data.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(6);
    expect(plan.selectedTests).toEqual([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
    ]);
  });

  it('maps deterministic Promptfoo changes to their contract tests', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/scripts/run-deterministic-promptfoo-evals.sh',
      'apps/web/tests/eval/promptfoo/jovie-chat-provider.ts',
      'apps/web/tests/eval/promptfoo/promptfooconfig.yaml',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toEqual([
      'apps/web/tests/eval/promptfoo/jovie-chat-provider.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/lib/agents/registry.test.ts',
      'apps/web/scripts/sync-skills-catalog.test.ts',
    ]);
  });

  it('keeps the #14010 investor note ingestion diff on its focused suites', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/lib/investors/note-ingestion.ts',
      'apps/web/scripts/ingest-investor-note.ts',
      'apps/web/tests/fixtures/investors/note-a.json',
      'apps/web/tests/fixtures/investors/note-b.json',
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
      'docs/fundraising/investor-note-ingestion.md',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(6);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
    ]);
  });

  it('fails closed when the investor ingestion lane is mixed with unknown source', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/investors/note-ingestion.ts',
        'apps/web/lib/investors/deleted-unknown.ts',
      ]).mode
    ).toBe('full');
  });

  it('fails closed for an unrelated investor fixture', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/tests/fixtures/investors/portfolio-summary.json',
      ]).mode
    ).toBe('full');
  });

  it('keeps the cancellation healer diff on its focused contract suites', () => {
    const plan = buildAffectedTestPlan([
      '.github/workflows/ci-cancellation-healer.yml',
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
      'scripts/ci-fast-lanes.mjs',
      'scripts/lib/ci-cancellation-classifier.mjs',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
    ]);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
  });

  it.each([
    '.github/workflows/ci-cancellation-healer.yml',
    'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
    'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
    'scripts/lib/ci-cancellation-classifier.mjs',
  ])('maps the cancellation healer input %s independently', input => {
    const plan = buildAffectedTestPlan([input]);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
  });

  it('keeps the global ci-fast orchestrator on the full suite standalone', () => {
    expect(buildAffectedTestPlan(['scripts/ci-fast-lanes.mjs']).mode).toBe(
      'full'
    );
  });

  it('fails closed when the cancellation healer lane includes unknown automation', () => {
    expect(
      buildAffectedTestPlan([
        'scripts/lib/ci-cancellation-classifier.mjs',
        'scripts/lib/unknown-ci-repair.mjs',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when the cancellation healer lane includes an unknown action', () => {
    expect(
      buildAffectedTestPlan([
        '.github/workflows/ci-cancellation-healer.yml',
        '.github/actions/unknown-runner-repair/action.yml',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when the cancellation healer lane is mixed with unknown source', () => {
    expect(
      buildAffectedTestPlan([
        '.github/workflows/ci-cancellation-healer.yml',
        'apps/web/lib/unknown.ts',
      ]).mode
    ).toBe('full');
  });

  it('keeps the four-commit prerequisite train on its focused contracts', () => {
    const plan = buildAffectedTestPlan(PREREQUISITE_TRAIN_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(22);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
      ...PREREQUISITE_TRAIN_TESTS,
    ]);
    expect(plan.selectedTests).toEqual([
      ...PREREQUISITE_TRAIN_TESTS,
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
    ]);
    expect(plan.selectedTests).not.toContain(
      'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts'
    );
    expect(plan.selectedTests).not.toContain(
      'apps/web/tests/e2e/golden-path.spec.ts'
    );
  });

  it.each(
    PREREQUISITE_TRAIN_CORNERS
  )('fails closed when the prerequisite train cornerstone %s is standalone', cornerstone => {
    expect(buildAffectedTestPlan([cornerstone]).mode).toBe('full');
  });

  it.each([
    '.github/workflows/ci.yml',
    'apps/web/tests/seed-test-data.ts',
    'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
    'apps/web/tests/e2e/golden-path.spec.ts',
  ])('fails closed when the prerequisite train global input %s is standalone', input => {
    expect(buildAffectedTestPlan([input]).mode).toBe('full');
  });

  it.each(
    PREREQUISITE_TRAIN_CORNERS
  )('fails closed when the prerequisite train is missing %s', missingCornerstone => {
    expect(
      buildAffectedTestPlan(
        PREREQUISITE_TRAIN_MANIFEST.filter(file => file !== missingCornerstone)
      ).mode
    ).toBe('full');
  });

  it.each([
    'apps/web/lib/unknown-prerequisite.ts',
    '.github/actions/unknown-prerequisite/action.yml',
  ])('fails closed when the prerequisite train includes unknown peer %s', peer => {
    expect(
      buildAffectedTestPlan([...PREREQUISITE_TRAIN_MANIFEST, peer]).mode
    ).toBe('full');
  });

  it('fails closed to the full suite for global test inputs', () => {
    expect(buildAffectedTestPlan(['apps/web/tests/setup.ts']).mode).toBe(
      'full'
    );
  });

  it('fails closed when a web source has no test lane', () => {
    expect(buildAffectedTestPlan(['apps/web/lib/unknown.ts']).mode).toBe(
      'full'
    );
  });

  it('fails closed when an unknown source is mixed with a direct test', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/unknown.ts',
        'apps/web/tests/unit/known.test.ts',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when an unknown source is mixed with a known profile surface', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/unknown.ts',
        'apps/web/components/features/profile/ProfileHeroCard.tsx',
      ]).mode
    ).toBe('full');
  });

  it('classifies a deleted unknown source as full-suite work', () => {
    expect(buildAffectedTestPlan(['apps/web/lib/deleted.ts']).mode).toBe(
      'full'
    );
    expect(runner).toContain('--diff-filter=ACDMR');
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ])('terminates the owned child process group on %s', async signal => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(resolve(tmpdir(), 'affected-process-group-'));
    const pidFile = resolve(dir, 'grandchild.pid');
    const childCode = `
        const { spawn } = require('node:child_process');
        const { writeFileSync } = require('node:fs');
        const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
        setInterval(() => {}, 1000);
      `;
    const wrapperCode = `
        import { runCommand } from ${JSON.stringify(
          new URL('../../run-affected-tests.mjs', import.meta.url).href
        )};
        await runCommand(process.execPath, ['-e', ${JSON.stringify(childCode)}]);
      `;
    const wrapper = spawn(
      process.execPath,
      ['--input-type=module', '-e', wrapperCode],
      { stdio: 'ignore' }
    );
    let grandchildPid;
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          const candidatePid = Number(readFileSync(pidFile, 'utf8'));
          if (Number.isInteger(candidatePid) && candidatePid > 0) {
            grandchildPid = candidatePid;
            break;
          }
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        } catch {
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        }
      }
      expect(grandchildPid).toBeGreaterThan(0);
      wrapper.kill(signal);
      await Promise.race([
        new Promise(resolveExit => wrapper.once('exit', resolveExit)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('wrapper did not exit')), 5000)
        ),
      ]);
      const exitDeadline = Date.now() + 5000;
      let alive = true;
      while (alive && Date.now() < exitDeadline) {
        try {
          process.kill(grandchildPid, 0);
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      if (wrapper.exitCode === null) wrapper.kill('SIGKILL');
      if (grandchildPid) {
        try {
          process.kill(grandchildPid, 'SIGKILL');
        } catch {}
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
