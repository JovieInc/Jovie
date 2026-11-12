import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

// Registered by the maintained ci-fast workflow contract test entry point.
/** @param {(jobId: string, nextJobId: string) => string} jobBlock */
export function defineStorybookBrowserSelectionTests(jobBlock) {
  it('runs onboarding recovery proof in active Source Validation for affected source, stories and specs', () => {
    const workflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/source-validation.yml'),
      'utf8'
    );
    expect(workflow).toMatch(/on:\s*\n\s+pull_request:/);
    const step = workflow
      .split('      - name: Verify onboarding recovery browser behavior\n')[1]
      ?.split('      - name:')[0];
    expect(
      step,
      'the active pull_request workflow must run the proof'
    ).toBeTruthy();
    const command = step.split('run: |\n')[1];
    const stubs = `git() {
      case "$1" in
        rev-parse) printf '%s\\n' "$EXPECTED_HEAD" ;;
        merge-base) printf 'base\\n' ;;
        diff) printf '%s\\n' "$CHANGED_PATHS" ;;
        *) return 1 ;;
      esac
    }
    node() { printf '%s\\n' "$*"; }
    `;
    /** @type {[string, boolean][]} */
    const cases = [
      ['apps/web/components/features/onboarding/OnboardingShell.tsx', true],
      [
        'apps/web/components/features/onboarding/OnboardingShell.recovery.stories.tsx',
        true,
      ],
      ['apps/web/components/features/onboarding/OnboardingChat.tsx', true],
      ['apps/web/tests/e2e/storybook-onboarding-recovery.spec.ts', true],
      ['apps/web/components/shell/Other.tsx', false],
      ['apps/web/tests/e2e/storybook-onboarding-recovery.spec.ts.bak', false],
    ];
    for (const [path, selected] of cases) {
      const result = spawnSync('bash', ['-c', stubs + command], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CHANGED_PATHS: path,
          EXPECTED_HEAD: 'head',
          BASE_BRANCH: 'main',
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(
        result.stdout.includes(
          'tests/e2e/storybook-onboarding-recovery.spec.ts'
        ),
        path
      ).toBe(selected);
      if (selected)
        expect(result.stdout).toContain(
          'guard-playwright-artifacts.mjs --run -- pnpm --filter @jovie/web exec playwright test'
        );
    }
    const failure = spawnSync(
      'bash',
      ['-c', stubs + 'node() { return 37; }\n' + command],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CHANGED_PATHS:
            'apps/web/components/features/onboarding/OnboardingShell.tsx',
          EXPECTED_HEAD: 'head',
          BASE_BRANCH: 'main',
        },
      }
    );
    expect(failure.status).toBe(37);
  });

  it('selects the crawler state proof through the maintained Storybook browser path', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(/CRAWLER_STORYBOOK_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.stories.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard.stories.tsx',
      'apps/web/tests/e2e/storybook-ai-crawler.spec.ts',
    ]) {
      expect(
        spawnSync('grep', ['-qE', pattern], {
          input: `${path}\n`,
          encoding: 'utf8',
        }).status,
        path
      ).toBe(0);
    }
    expect(
      spawnSync('grep', ['-qE', pattern], {
        input:
          'apps/web/components/features/dashboard/organisms/OtherDialog.tsx\n',
        encoding: 'utf8',
      }).status
    ).not.toBe(0);

    const selector = remaining
      .split('id: storybook-browser\n')[1]
      .split('      - name: Start ci-fast lanes')[0];
    const command = selector
      .split('run: |\n')[1]
      .replaceAll('${{ github.event_name }}', 'pull_request')
      .replaceAll('${{ github.base_ref }}', 'main');
    const root = mkdtempSync(join(tmpdir(), 'crawler-storybook-selection-'));
    try {
      const output = join(root, 'output');
      const result = spawnSync(
        'bash',
        ['-c', 'git() { printf "%s\\n" "$CHANGED_PATHS"; }\n' + command],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            CHANGED_PATHS:
              'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.stories.tsx',
            RUNNER_TEMP: root,
            GITHUB_OUTPUT: output,
          },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        Object.fromEntries(
          readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('='))
        )
      ).toEqual({
        run: 'true',
        spotify: 'false',
        kbd: 'false',
        crawler: 'true',
        desktop_update: 'false',
        dsp: 'false',
        smart_link: 'false',
        account_surface: 'false',
        overlay: 'false',
        privacy: 'false',
        tasks: 'false',
      });

      const runner = remaining
        .split('id: storybook-browser-test')[1]
        .split('      - name: Upload Storybook browser evidence')[0];
      const selection = runner.slice(
        runner.indexOf('          specs=()'),
        runner.indexOf('          pnpm exec storybook dev')
      );
      const chosen = spawnSync(
        'bash',
        ['-c', selection + '\nprintf "%s\\n" "${specs[@]}"'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            RUN_SPOTIFY: 'false',
            RUN_KBD: 'false',
            RUN_CRAWLER: 'true',
            RUN_OVERLAY: 'false',
            RUN_TASKS: 'false',
            RUN_PRIVACY: 'false',
          },
        }
      );
      expect(chosen.status, chosen.stderr).toBe(0);
      expect(chosen.stdout.trim().split('\n')).toEqual([
        'tests/e2e/storybook-ai-crawler.spec.ts',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('selects smart-link reachability for the shell and runs its maintained browser proof', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(
      /SMART_LINK_STORYBOOK_PATTERN='([^']+)'/
    )?.[1];
    expect(pattern).toBeTruthy();
    const affected = [
      'apps/web/components/features/release/SmartLinkShell.tsx',
      'apps/web/components/features/release/SmartLinkShell.stories.tsx',
      'apps/web/components/features/release/SmartLinkShell.test.tsx',
      'apps/web/components/features/release/ActionDial.tsx',
      'apps/web/components/features/release/MusicServiceDial.tsx',
      'apps/web/components/organisms/public-surface/PublicSurfaceShell.tsx',
      'apps/web/components/organisms/public-surface/PublicSurfaceStage.tsx',
      'apps/web/components/organisms/ReleaseLandingPage.stories.tsx',
      'apps/web/app/r/[slug]/ReleaseLandingPage.tsx',
      'apps/web/app/globals.css',
      'apps/web/styles/design-system.css',
      'apps/web/tests/e2e/storybook-smart-link-reachability.spec.ts',
    ];
    const unrelated = 'apps/web/components/shell/Other.tsx';
    for (const path of [...affected, unrelated, `${affected[0]}.bak`]) {
      const match = spawnSync('grep', ['-qE', pattern ?? 'a^'], {
        input: `${path}\n`,
        encoding: 'utf8',
      });
      expect(match.status, path).toBe(affected.includes(path) ? 0 : 1);
    }
    const selector = remaining
      .split('id: storybook-browser\n')[1]
      .split('      - name: Start ci-fast lanes')[0];
    const command = selector
      .split('run: |\n')[1]
      .replaceAll('${{ github.event_name }}', 'pull_request')
      .replaceAll('${{ github.base_ref }}', 'main');
    const root = mkdtempSync(join(tmpdir(), 'smart-link-storybook-selection-'));
    try {
      for (const [changed, selected] of [
        [affected.join('\n'), 'true'],
        [unrelated, 'false'],
      ]) {
        const output = join(root, `output-${selected}`);
        const result = spawnSync(
          'bash',
          ['-c', 'git() { printf "%s\\n" "$CHANGED_PATHS"; }\n' + command],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              CHANGED_PATHS: changed,
              RUNNER_TEMP: root,
              GITHUB_OUTPUT: output,
            },
          }
        );
        expect(result.status, result.stderr).toBe(0);
        const values = Object.fromEntries(
          readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('='))
        );
        expect(values.smart_link).toBe(selected);
        expect(values.run).toBe(selected);
      }
      const runner = remaining
        .split('id: storybook-browser-test')[1]
        .split('      - name: Upload Storybook browser evidence')[0];
      const selection = runner.slice(
        runner.indexOf('          specs=()'),
        runner.indexOf('          pnpm exec storybook dev')
      );
      const chosen = spawnSync(
        'bash',
        ['-c', selection + '\nprintf "%s\\n" "${specs[@]}"'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            RUN_SPOTIFY: 'false',
            RUN_KBD: 'false',
            RUN_CRAWLER: 'false',
            RUN_OVERLAY: 'false',
            RUN_PRIVACY: 'false',
            RUN_TASKS: 'false',
            RUN_DESKTOP_UPDATE: 'false',
            RUN_DSP: 'false',
            RUN_SMART_LINK: 'true',
          },
        }
      );
      const spec = 'tests/e2e/storybook-smart-link-reachability.spec.ts';
      expect(chosen.status, chosen.stderr).toBe(0);
      expect(chosen.stdout.trim().split('\n')).toEqual([spec]);
      expect(remaining).toContain(
        'RUN_SMART_LINK: ${{ steps.storybook-browser.outputs.smart_link }}'
      );
      const surfaces = jobBlock(
        'ci-storybook-surfaces',
        'ci-cross-product-integration'
      );
      const invocation = surfaces.match(
        /pnpm exec playwright test ([\s\S]*?)--config=playwright\.config\.storybook\.ts/
      );
      expect(invocation).not.toBeNull();
      expect(
        invocation[1].match(
          /tests\/e2e\/storybook-smart-link-reachability\.spec\.ts/g
        )
      ).toHaveLength(1);
      expect(existsSync(resolve(REPO_ROOT, 'apps/web', spec))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('selects the Tasks row geometry proof for its shared cell and feature surfaces', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(/TASKS_STORYBOOK_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'apps/web/components/features/dashboard/tasks/TaskDataTable.tsx',
      'apps/web/components/features/dashboard/tasks/TaskDataTable.stories.tsx',
      'apps/web/components/features/dashboard/tasks/TaskListRow.tsx',
      'apps/web/components/features/dashboard/tasks/TasksPageClient.tsx',
      'apps/web/components/organisms/table/atoms/TableCell.tsx',
      'apps/web/components/organisms/table/table.types.ts',
      'apps/web/components/organisms/table/organisms/VirtualizedTableRow.tsx',
      'apps/web/components/organisms/table/molecules/TaskProjectionListRow.tsx',
      'apps/web/tests/e2e/storybook-task-row-geometry.spec.ts',
    ]) {
      expect(
        spawnSync('grep', ['-qE', pattern], {
          input: `${path}\n`,
          encoding: 'utf8',
        }).status,
        path
      ).toBe(0);
    }
    expect(
      spawnSync('grep', ['-qE', pattern], {
        input:
          'apps/web/components/features/dashboard/releases/ReleaseList.tsx\n',
        encoding: 'utf8',
      }).status
    ).not.toBe(0);

    const selector = remaining
      .split('id: storybook-browser\n')[1]
      .split('      - name: Start ci-fast lanes')[0];
    const command = selector
      .split('run: |\n')[1]
      .replaceAll('${{ github.event_name }}', 'pull_request')
      .replaceAll('${{ github.base_ref }}', 'main');
    const root = mkdtempSync(join(tmpdir(), 'tasks-storybook-selection-'));
    try {
      const output = join(root, 'output');
      const result = spawnSync(
        'bash',
        ['-c', 'git() { printf "%s\\n" "$CHANGED_PATHS"; }\n' + command],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            CHANGED_PATHS:
              'apps/web/components/organisms/table/organisms/VirtualizedTableRow.tsx',
            RUNNER_TEMP: root,
            GITHUB_OUTPUT: output,
          },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        Object.fromEntries(
          readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('='))
        )
      ).toEqual({
        run: 'true',
        spotify: 'false',
        kbd: 'false',
        crawler: 'false',
        overlay: 'false',
        tasks: 'true',
        desktop_update: 'false',
        dsp: 'false',
        smart_link: 'false',
        account_surface: 'false',
        privacy: 'false',
      });

      const runner = remaining
        .split('id: storybook-browser-test')[1]
        .split('      - name: Upload Storybook browser evidence')[0];
      const selection = runner.slice(
        runner.indexOf('          specs=()'),
        runner.indexOf('          pnpm exec storybook dev')
      );
      const chosen = spawnSync(
        'bash',
        ['-c', selection + '\nprintf "%s\\n" "${specs[@]}"'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            RUN_SPOTIFY: 'false',
            RUN_KBD: 'false',
            RUN_CRAWLER: 'false',
            RUN_OVERLAY: 'false',
            RUN_TASKS: 'true',
            RUN_PRIVACY: 'false',
          },
        }
      );
      expect(chosen.status, chosen.stderr).toBe(0);
      expect(chosen.stdout.trim().split('\n')).toEqual([
        'tests/e2e/storybook-task-row-geometry.spec.ts',
      ]);
      expect(
        jobBlock('ci-storybook-surfaces', 'ci-cross-product-integration')
      ).toContain('tests/e2e/storybook-task-row-geometry.spec.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
