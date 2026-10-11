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

// file -> why the self-hosted Macs buy nothing (or cost something) there.
const HOSTED_MACOS_ALLOWED = {
  'cli-chaos-nightly.yml': 'nightly; nothing waits on it',
  'codeql.yml': 'post-merge scan; nothing waits on it',
  'desktop-release.yml':
    'signs/notarizes with Developer ID and uploads the DMG (slow home uplink)',
  'ios-signing-bootstrap.yml': 'rare manual keychain/match bootstrap',
  'ios-testflight.yml': 'signs and uploads to App Store Connect',
};

const workflows = readdirSync(WORKFLOWS_DIR)
  .filter(file => /\.ya?ml$/.test(file))
  .map(file => ({
    file,
    runsOn: [
      ...readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8').matchAll(
        /^\s*runs-on:.*$/gm
      ),
    ].map(match => match[0]),
    matrixMac: /^\s*os: \[[^\]]*macos-/m.test(
      readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8')
    ),
  }));

describe('macOS jobs use the self-hosted Macs first', () => {
  it.each(workflows.map(workflow => [workflow.file, workflow]))(
    '%s routes macOS through mac-runner-route or documents why not',
    (file, { runsOn, matrixMac }) => {
      const usesMacos = matrixMac || runsOn.some(line => /macos-/.test(line));
      if (!usesMacos || HOSTED_MACOS_ALLOWED[file]) return;
      for (const line of runsOn.filter(l => /macos-|matrix\.os/.test(l))) {
        expect(line, `${file}: ${line.trim()}`).toContain(SELF_HOSTED_MAC);
        expect(line).toMatch(/runner_class == 'mac'/);
      }
    }
  );

  it('keeps every hosted exception attached to a real macOS workflow', () => {
    for (const file of Object.keys(HOSTED_MACOS_ALLOWED)) {
      const workflow = workflows.find(w => w.file === file);
      expect(workflow, file).toBeDefined();
      expect(
        workflow.matrixMac || workflow.runsOn.some(l => /macos-/.test(l)),
        file
      ).toBe(true);
    }
  });
});
