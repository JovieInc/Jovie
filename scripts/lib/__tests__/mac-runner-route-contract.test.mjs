import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Policy: .claude/rules/infra.md "macOS runners: self-hosted first".
const WORKFLOWS_DIR = resolve(
  import.meta.dirname,
  '../../../.github/workflows'
);
const SELF_HOSTED_MAC =
  'fromJSON(\'["self-hosted","macOS","ARM64","jovie-mac"]\')';
const read = file => readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8');

// file -> why the self-hosted Macs buy nothing (or cost something) there.
const HOSTED_MACOS_ALLOWED = {
  'cli-chaos-nightly.yml': 'nightly; nothing waits on it',
  'codeql.yml': 'post-merge scan; nothing waits on it',
  'desktop-release.yml':
    'signs/notarizes with Developer ID and uploads the DMG (slow home uplink)',
  'ios-app-store-graphics.yml':
    'path-filtered and advisory; also a release call; nothing in the queue waits on it',
  'ios-signing-bootstrap.yml': 'rare manual keychain/match bootstrap',
  'ios-testflight.yml': 'signs and uploads to App Store Connect',
  'npm-publish.yml':
    'post-merge publish nothing in the queue waits on; its legs need this run’s tarball',
};

// Mac-first lanes: workflow -> mac-lane.yml lane that runs it on a Mac.
const MAC_LANES = { 'ios-ci.yml': 'ios', 'macos-ci.yml': 'macos' };

const workflows = readdirSync(WORKFLOWS_DIR)
  .filter(file => /\.ya?ml$/.test(file))
  .map(file => {
    const source = read(file);
    return {
      file,
      source,
      runsOn: [...source.matchAll(/^\s*runs-on:.*$/gm)].map(m => m[0]),
      matrixMac: /^\s*os: \[[^\]]*macos-/m.test(source),
    };
  });

const usesMacos = ({ runsOn, matrixMac }) =>
  matrixMac || runsOn.some(line => /macos-/.test(line));

describe('macOS jobs use the self-hosted Macs first', () => {
  it.each(workflows.map(workflow => [workflow.file, workflow]))(
    '%s routes macOS through mac-lane-route.yml or documents why not',
    (file, workflow) => {
      if (!usesMacos(workflow) || HOSTED_MACOS_ALLOWED[file]) return;
      expect(
        MAC_LANES[file],
        `${file} needs a mac-lane.yml lane`
      ).toBeDefined();
      expect(workflow.source).toContain(
        'uses: ./.github/workflows/mac-lane-route.yml'
      );
      for (const line of workflow.runsOn.filter(l => /macos-/.test(l))) {
        expect(line, `${file}: ${line.trim()}`).toContain(
          `inputs.mac-child && ${SELF_HOSTED_MAC} ||`
        );
      }
    }
  );

  it('queues on the Macs only from mac-lane.yml child runs', () => {
    // A job queued straight on jovie-mac waits forever when the Mac sleeps.
    for (const { file, runsOn } of workflows) {
      for (const line of runsOn.filter(l => /jovie-mac/.test(l))) {
        expect(line, `${file}: ${line.trim()}`).toMatch(
          /inputs\.mac-child && fromJSON/
        );
      }
    }
  });

  it('gives every Mac-first lane a child job that holds the join group', () => {
    const child = read('mac-lane.yml');
    expect(child).toContain('workflow_dispatch:');
    expect(child).toMatch(
      /^concurrency:\n {2}group: \$\{\{ inputs\.supersede-group \}\}\n {2}cancel-in-progress: true/m
    );
    for (const [file, lane] of Object.entries(MAC_LANES)) {
      expect(child).toContain(`if: \${{ inputs.lane == '${lane}' }}`);
      expect(child).toContain(`uses: ./.github/workflows/${file}`);
      expect(read(file)).toContain(`lane: ${lane}`);
    }
    expect(child.match(/group: \$\{\{ inputs\.join-group \}\}/g)).toHaveLength(
      Object.keys(MAC_LANES).length
    );
  });

  it('routes only first attempts of trusted events and never holds', () => {
    const route = read('mac-lane-route.yml');
    expect(route).toContain(
      "      vars.JOVIE_MAC_RUNNER != 'off' &&\n      github.run_attempt == '1' &&\n      (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)"
    );
    expect(route).toContain(
      "if: ${{ needs.dispatch.outputs.fallback == 'false' && github.run_attempt == '1' }}"
    );
    // Merge-group jobs carry no secrets; the pickup itself is the live check.
    expect(route).not.toMatch(/secrets\./);
    expect(route).toContain('group: ${{ needs.dispatch.outputs.join_group }}');
    // Any missing or uncertain Mac evidence means the caller runs hosted.
    expect(route).toContain(
      "value: ${{ jobs.dispatch.outputs.fallback != 'false' || jobs.join.outputs.infra != 'false' }}"
    );
    // JOV-INV-042: event-driven only.
    for (const file of ['mac-lane-route.yml', 'mac-lane.yml']) {
      expect(read(file)).not.toMatch(/^\s*schedule:/m);
    }
  });

  it('keeps every hosted exception attached to a real macOS workflow', () => {
    for (const file of Object.keys(HOSTED_MACOS_ALLOWED)) {
      const workflow = workflows.find(w => w.file === file);
      expect(workflow, file).toBeDefined();
      expect(usesMacos(workflow), file).toBe(true);
    }
  });
});
