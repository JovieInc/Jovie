import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyDependabotEventPayload,
  classifyDependabotUpdate,
  DURABLE_HOLD_LABELS,
  formatGithubOutput,
  runDependabotUpdatePolicy,
} from '../../dependabot-update-policy.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/dependabot-auto-merge.yml'),
  'utf8'
);
const CONFIG = readFileSync(
  resolve(REPO_ROOT, '.github/dependabot.yml'),
  'utf8'
);

function pullRequest(overrides = {}) {
  return {
    user: { login: 'dependabot[bot]' },
    base: { ref: 'main' },
    draft: false,
    merged: false,
    labels: [{ name: 'dependencies' }, { name: 'automated' }],
    ...overrides,
  };
}

function classify(overrides = {}) {
  return classifyDependabotUpdate({
    action: 'synchronize',
    actor: 'cursor[bot]',
    pullRequest: pullRequest(),
    updateType: 'version-update:semver-minor',
    ...overrides,
  });
}

describe('Dependabot event policy', () => {
  it.each([
    ['version-update:semver-patch'],
    ['version-update:semver-minor'],
  ])('queues a safe %s update after a maintainer synchronization', updateType => {
    expect(classify({ updateType })).toMatchObject({
      decision: 'queue',
      reason: 'safe-update-eligible',
    });
  });

  it('re-enrolls safe updates after another controller removes queue intent', () => {
    expect(classify({ action: 'unlabeled' }).decision).toBe('queue');
  });

  it('recreates a safe update when the conflict label is applied', () => {
    expect(
      classify({
        action: 'labeled',
        eventLabelName: 'needs-conflict-resolution',
        pullRequest: pullRequest({
          labels: [
            { name: 'dependencies' },
            { name: 'automated' },
            { name: 'needs-conflict-resolution' },
          ],
        }),
      })
    ).toMatchObject({
      decision: 'recreate',
      hasConflictLabel: true,
    });
  });

  it('reopens a safe unmerged update closed by a maintainer or controller', () => {
    expect(classify({ action: 'closed', actor: 'itstimwhite' })).toMatchObject({
      decision: 'reopen-recreate',
      reason: 'safe-update-closed-without-hold',
    });
  });

  it.each([
    [
      'merged update',
      { action: 'closed', pullRequest: pullRequest({ merged: true }) },
    ],
    ['Dependabot self-close', { action: 'closed', actor: 'dependabot[bot]' }],
    [
      'durably held close',
      {
        action: 'closed',
        pullRequest: pullRequest({ labels: [{ name: 'no-auto' }] }),
      },
    ],
    [
      'non-Dependabot author',
      { pullRequest: pullRequest({ user: { login: 'user' } }) },
    ],
    ['missing pull request payload', { pullRequest: undefined }],
    ['draft', { pullRequest: pullRequest({ draft: true }) }],
    [
      'non-main base',
      { pullRequest: pullRequest({ base: { ref: 'release' } }) },
    ],
  ])('does not recover or queue a %s', (_name, overrides) => {
    expect(classify(overrides).decision).toBe('noop');
  });

  it('holds a visible major update for migration and release review', () => {
    expect(
      classify({ updateType: 'version-update:semver-major' })
    ).toMatchObject({
      decision: 'hold-major',
      reason: 'major-requires-migration-review',
    });
  });

  it.each([
    ['closed major', { action: 'closed' }],
    [
      'already-held major',
      { pullRequest: pullRequest({ labels: ['needs-human'] }) },
    ],
  ])('does not reopen or repeat the hold for an %s', (_name, overrides) => {
    expect(
      classify({
        updateType: 'version-update:semver-major',
        ...overrides,
      }).decision
    ).toBe('noop');
  });

  it('clears the conflict hold only after Dependabot publishes a recreated head', () => {
    expect(
      classify({
        actor: 'dependabot[bot]',
        pullRequest: pullRequest({
          labels: ['dependencies', 'needs-conflict-resolution'],
        }),
      })
    ).toMatchObject({
      decision: 'queue-recovered',
      reason: 'safe-update-recreated-head',
    });
  });

  it('preserves the conflict receipt while recreation is still pending', () => {
    expect(
      classify({
        action: 'reopened',
        pullRequest: pullRequest({
          labels: ['dependencies', 'needs-conflict-resolution'],
        }),
      })
    ).toMatchObject({
      decision: 'noop',
      reason: 'conflict-recovery-already-requested',
    });
  });

  it('does not trust a maintainer or controller synchronization as recreation proof', () => {
    expect(
      classify({
        actor: 'cursor[bot]',
        pullRequest: pullRequest({
          labels: ['dependencies', 'needs-conflict-resolution'],
        }),
      })
    ).toMatchObject({
      decision: 'noop',
      reason: 'conflict-recovery-already-requested',
    });
  });

  it('fails closed for unknown update metadata', () => {
    expect(classify({ updateType: '' })).toMatchObject({
      decision: 'noop',
      reason: 'update-type-not-auto-eligible',
    });
  });

  it.each([
    ...DURABLE_HOLD_LABELS,
  ])('never queues an update with the durable %s hold', label => {
    expect(
      classify({ pullRequest: pullRequest({ labels: [{ name: label }] }) })
        .decision
    ).toBe('noop');
  });

  it.each([
    'needs-human-taste',
    'needs:taste',
    'taste',
    'llm-review',
  ])('keeps the advisory %s label out of the durable hold set', label => {
    expect(
      classify({ pullRequest: pullRequest({ labels: [{ name: label }] }) })
        .decision
    ).toBe('queue');
  });
});

describe('Dependabot policy runner', () => {
  const event = {
    action: 'labeled',
    sender: { login: 'github-actions[bot]' },
    label: { name: 'needs-conflict-resolution' },
    pull_request: pullRequest({
      labels: ['dependencies', 'needs-conflict-resolution'],
    }),
  };

  it('normalizes an event payload and emits stable GitHub outputs', () => {
    const result = classifyDependabotEventPayload(event, {
      DEPENDABOT_UPDATE_TYPE: 'version-update:semver-patch',
    });

    expect(result.decision).toBe('recreate');
    expect(formatGithubOutput(result)).toBe(
      [
        'decision=recreate',
        'reason=safe-update-has-confirmed-conflict',
        'has_conflict_label=true',
        'has_queue_label=false',
      ].join('\n')
    );
  });

  it('runs the exact event-file read, output append, and JSON receipt path', () => {
    const appended = [];
    const logged = [];
    const result = runDependabotUpdatePolicy(
      {
        GITHUB_EVENT_PATH: '/tmp/event.json',
        GITHUB_OUTPUT: '/tmp/output',
        DEPENDABOT_UPDATE_TYPE: 'version-update:semver-patch',
      },
      {
        readFile: () => JSON.stringify(event),
        appendFile: (...args) => appended.push(args),
        log: value => logged.push(value),
      }
    );

    expect(result.decision).toBe('recreate');
    expect(appended).toEqual([
      ['/tmp/output', `${formatGithubOutput(result)}\n`, 'utf8'],
    ]);
    expect(logged).toEqual([JSON.stringify(result)]);
  });

  it('supports local classification without a GitHub output file', () => {
    const appendFile = vi.fn();
    expect(
      runDependabotUpdatePolicy(
        {
          GITHUB_EVENT_PATH: '/tmp/event.json',
          DEPENDABOT_UPDATE_TYPE: 'version-update:semver-patch',
          GITHUB_ACTOR: 'fallback-actor',
        },
        {
          readFile: () =>
            JSON.stringify({ ...event, sender: undefined, label: undefined }),
          appendFile,
          log: () => {},
        }
      ).decision
    ).toBe('noop');
    expect(appendFile).not.toHaveBeenCalled();
  });

  it('fails closed when event metadata and label entries are missing', () => {
    expect(
      classifyDependabotEventPayload({
        action: 'synchronize',
        pull_request: pullRequest({ labels: [null, { name: '' }] }),
      })
    ).toMatchObject({
      decision: 'noop',
      reason: 'update-type-not-auto-eligible',
    });
  });

  it('uses the production filesystem and GitHub output path by default', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'dependabot-policy-'));
    const eventPath = resolve(directory, 'event.json');
    const outputPath = resolve(directory, 'output');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      writeFileSync(eventPath, JSON.stringify(event), 'utf8');
      const result = runDependabotUpdatePolicy({
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        DEPENDABOT_UPDATE_TYPE: 'version-update:semver-patch',
      });

      expect(result.decision).toBe('recreate');
      expect(readFileSync(outputPath, 'utf8')).toBe(
        `${formatGithubOutput(result)}\n`
      );
      expect(log).toHaveBeenCalledWith(JSON.stringify(result));
    } finally {
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a missing event path', () => {
    expect(() =>
      runDependabotUpdatePolicy(
        {},
        { readFile: vi.fn(), appendFile: vi.fn(), log: vi.fn() }
      )
    ).toThrow('GITHUB_EVENT_PATH is required');
  });
});

describe('Dependabot reconciliation workflow contract', () => {
  it('runs write-capable reconciliation only from trusted base definitions', () => {
    expect(WORKFLOW).toMatch(/\non:\n(?:[\s\S]*?\n)?  pull_request_target:/);
    expect(WORKFLOW).not.toMatch(/\n  pull_request:/);
    expect(WORKFLOW).toContain(
      'ref: ${{ github.event.pull_request.base.sha }}'
    );
    expect(WORKFLOW).toContain('persist-credentials: false');
    expect(WORKFLOW).not.toContain('github.event.pull_request.head.sha');
    expect(WORKFLOW).not.toContain('ready_for_review');
    expect(WORKFLOW).toContain('contents: read');
    expect(WORKFLOW).toContain('pull-requests: write');
    expect(WORKFLOW).not.toContain('echo "Dependency: ${{');
    expect(WORKFLOW).not.toContain('echo "Update type: ${{');

    const externalActions = [...WORKFLOW.matchAll(/uses: ([^\s#]+)/g)].map(
      match => match[1]
    );
    expect(externalActions.length).toBeGreaterThan(0);
    for (const action of externalActions) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it('keys reconciliation to the PR author across maintainer-driven events', () => {
    expect(WORKFLOW).toContain(
      "github.event.pull_request.user.login == 'dependabot[bot]'"
    );
    expect(WORKFLOW).not.toContain("github.actor == 'dependabot[bot]'");
  });

  it('wakes for label churn, conflicts, and unmerged closure recovery', () => {
    expect(WORKFLOW).toContain(
      'types: [opened, reopened, synchronize, labeled, unlabeled, closed]'
    );
    expect(WORKFLOW).toContain('scripts/dependabot-update-policy.mjs');
    expect(WORKFLOW).toContain('@dependabot recreate');
    expect(WORKFLOW).toContain('gh pr reopen');
    expect(WORKFLOW).toContain(
      "steps.policy.outputs.decision == 'queue-recovered'"
    );
  });
});

describe('Dependabot discovery contract', () => {
  it('checks npm every weekday without the observed ten-slot starvation', () => {
    const npm = CONFIG.match(
      /  - package-ecosystem: 'npm'[\s\S]*?(?=\n  - package-ecosystem:|$)/
    )?.[0];

    expect(npm).toBeTruthy();
    expect(npm).toContain("interval: 'daily'");
    expect(npm).toContain('open-pull-requests-limit: 25');
    expect(npm).toContain('semver-patch-days: 1');
    expect(npm).toContain('semver-minor-days: 3');
    expect(npm).toContain('semver-major-days: 7');
  });

  it('routes framework majors instead of silently ignoring them', () => {
    for (const dependency of ['next', 'react', 'react-dom']) {
      expect(CONFIG).not.toMatch(
        new RegExp(
          `dependency-name: '${dependency}'[\\s\\S]{0,100}version-update:semver-major`
        )
      );
    }
  });
});
