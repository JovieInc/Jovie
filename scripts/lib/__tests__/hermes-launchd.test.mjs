import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const INSTALL_HELPER = join(
  REPO_ROOT,
  'scripts/hermes/lib/install-launchd-artifacts.sh'
);

function installLaunchdFixtures({ pythonSource, plistSource }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'hermes-launchd-install-'));
  const sourceDir = join(fixtureRoot, 'source');
  const installedDir = join(fixtureRoot, 'installed');
  const binDir = join(fixtureRoot, 'bin');
  mkdirSync(sourceDir);
  mkdirSync(installedDir);
  mkdirSync(binDir);

  const pythonPath = join(sourceDir, 'entrypoint.py');
  const plistPath = join(sourceDir, 'job.plist');
  const installedPython = join(installedDir, 'entrypoint.py');
  const installedPlist = join(installedDir, 'job.plist');
  writeFileSync(pythonPath, pythonSource);
  writeFileSync(plistPath, plistSource);
  writeFileSync(installedPython, 'ORIGINAL_PYTHON\n');
  writeFileSync(installedPlist, 'ORIGINAL_PLIST\n');

  const plutilPath = join(binDir, 'plutil');
  writeFileSync(
    plutilPath,
    `#!/usr/bin/env python3
import plistlib
import sys

with open(sys.argv[-1], 'rb') as handle:
    plistlib.load(handle)
`
  );
  chmodSync(plutilPath, 0o755);

  const result = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
source "$INSTALL_HELPER"
stage="$(hermes_create_launchd_stage)"
trap 'hermes_remove_launchd_stage "$stage"' EXIT
hermes_stage_artifact "$FIXTURE_PYTHON" "$stage/entrypoint.py" 755
hermes_stage_artifact "$FIXTURE_PLIST" "$stage/job.plist" 644
hermes_install_validated_launchd_artifacts "$stage" \
  "$stage/entrypoint.py" "$INSTALLED_PYTHON" 755 \
  "$stage/job.plist" "$INSTALLED_PLIST" 644`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIXTURE_PLIST: plistPath,
        FIXTURE_PYTHON: pythonPath,
        HERMES_PLUTIL_BIN: plutilPath,
        INSTALLED_PLIST: installedPlist,
        INSTALLED_PYTHON: installedPython,
        INSTALL_HELPER,
      },
    }
  );

  return { installedPlist, installedPython, result };
}

function renderTemplate(templatePath, mapping) {
  let content = readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(mapping)) {
    content = content.replaceAll(key, value);
  }
  return content;
}

describe('hermes launchd pro templates', () => {
  it('renders codex kanban ship plist with 15m schedule and ship-loop entrypoint', () => {
    const templatePath = join(
      REPO_ROOT,
      'scripts/hermes/launchd/pro/co.jovie.hermes.cron-codex-kanban-ship.plist.template'
    );
    const rendered = renderTemplate(templatePath, {
      '{{HOME}}': '/Users/tester',
      '{{JOVIE_REPO}}': '/Users/tester/Jovie',
      '{{NODE_BIN_DIR}}': '/Users/tester/.nvm/versions/node/v22.13.0/bin',
    });

    expect(rendered).toContain(
      '<string>co.jovie.hermes.cron-codex-kanban-ship</string>'
    );
    expect(rendered).toContain('<integer>900</integer>');
    expect(rendered).toContain(
      '/Users/tester/Jovie/scripts/hermes/ship-loop.sh'
    );
    expect(rendered).toContain(
      '/Users/tester/.hermes/logs/launchd/cron-codex-kanban-ship.log'
    );
    expect(rendered).toContain('<key>HERMES_SHIP</key>');
  });
});

describe('hermes gh monitor launchd templates', () => {
  const mapping = {
    '{{HOME}}': '/Users/tester',
    '{{JOVIE_REPO}}': '/Users/tester/Jovie',
    '{{TSX_BIN}}': '/Users/tester/.hermes/node/bin/tsx',
  };

  it('ci monitor plist sets WorkingDirectory to the Jovie repo', () => {
    const templatePath = join(
      REPO_ROOT,
      'scripts/hermes/launchd/co.jovie.hermes.cron-ci-monitor.plist.template'
    );
    const rendered = renderTemplate(templatePath, mapping);

    expect(rendered).toContain(
      '<string>co.jovie.hermes.cron-ci-monitor</string>'
    );
    expect(rendered).toContain(
      '/Users/tester/Jovie/scripts/hermes/jobs/ci-failure-monitor.ts'
    );
    expect(rendered).toContain('<key>WorkingDirectory</key>');
    expect(rendered).toContain('<string>/Users/tester/Jovie</string>');
  });

  it('pr monitor plist sets WorkingDirectory to the Jovie repo', () => {
    const templatePath = join(
      REPO_ROOT,
      'scripts/hermes/launchd/co.jovie.hermes.cron-pr-monitor.plist.template'
    );
    const rendered = renderTemplate(templatePath, mapping);

    expect(rendered).toContain(
      '<string>co.jovie.hermes.cron-pr-monitor</string>'
    );
    expect(rendered).toContain(
      '/Users/tester/Jovie/scripts/hermes/jobs/pr-stuck-monitor.ts'
    );
    expect(rendered).toContain('<key>WorkingDirectory</key>');
    expect(rendered).toContain('<string>/Users/tester/Jovie</string>');
  });
});

describe('shipper-gated entrypoint', () => {
  it('compiles every Python launchd entrypoint', () => {
    const entrypoints = readdirSync(join(REPO_ROOT, 'scripts/hermes')).filter(
      entry => entry.endsWith('.py')
    );
    const pycache = mkdtempSync(join(tmpdir(), 'hermes-pycache-'));

    expect(entrypoints.length).toBeGreaterThan(0);

    for (const entrypoint of entrypoints) {
      const result = spawnSync(
        'python3',
        ['-m', 'py_compile', join(REPO_ROOT, 'scripts/hermes', entrypoint)],
        {
          encoding: 'utf8',
          env: { ...process.env, PYTHONPYCACHEPREFIX: pycache },
        }
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    }
  });

  it('documents gbrain and grok preflight gates', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/hermes/shipper-gated-entrypoint.py'),
      'utf8'
    );
    expect(script).toContain('pause_active');
    expect(script).toContain('gbrain_alive');
    expect(script).toContain('grok_alive');
    expect(script).toContain('checkout_gate');
    expect(script).toContain('codex-issue-shipper.ts');
  });

  it('documents pause, gbrain, grok, and checkout fail-closed gates', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/hermes/shipper-gated-entrypoint.py'),
      'utf8'
    );
    expect(script).toContain('stale_checkout_abort');
    expect(script).toContain('gbrain_gate_abort');
    expect(script).toContain('grok_gate_abort');
    expect(script).toContain('shipping-paused');
    expect(script).toContain('SHIPPER_CRITICAL_PATHS');
  });

  it('codex issue shipper launchd plist uses the gated entrypoint', () => {
    const templatePath = join(
      REPO_ROOT,
      'scripts/hermes/launchd/co.jovie.hermes.cron-codex-issue-shipper.plist.template'
    );
    const rendered = renderTemplate(templatePath, {
      '{{HOME}}': '/Users/tester',
      '{{JOVIE_REPO}}': '/Users/tester/Jovie',
      '{{NODE_BIN_DIR}}': '/Users/tester/.nvm/versions/node/v22.13.0/bin',
    });

    expect(rendered).toContain(
      '<string>co.jovie.hermes.cron-codex-issue-shipper</string>'
    );
    expect(rendered).toContain('<integer>900</integer>');
    expect(rendered).toContain(
      '/Users/tester/.hermes/scripts/shipper-gated-entrypoint.py'
    );
    expect(rendered).toContain('/Users/tester/Jovie');
    expect(rendered).toContain('<key>KeepAlive</key>');
    expect(rendered).toContain('<key>SuccessfulExit</key>');
    expect(rendered).toContain('<false/>');
    expect(rendered).toContain('<key>ThrottleInterval</key>');
    expect(rendered).toContain('<integer>60</integer>');
    expect(rendered).toContain(
      '<key>HERMES_CODEX_SHIPPER_MAX_PARALLEL_AGENTS</key>'
    );
    expect(rendered).toContain('<string>2</string>');
  });
});

describe('hermes launchd artifact installation', () => {
  const validPython = 'print("ready")\n';
  const validPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>test</string></dict></plist>
`;

  it('installs only validated artifacts with source-identical bytes', () => {
    const { installedPlist, installedPython, result } = installLaunchdFixtures({
      plistSource: validPlist,
      pythonSource: validPython,
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(installedPython, 'utf8')).toBe(validPython);
    expect(readFileSync(installedPlist, 'utf8')).toBe(validPlist);
  });

  it.each([
    {
      name: 'invalid Python',
      plistSource: validPlist,
      pythonSource: 'def broken(:\n',
    },
    {
      name: 'invalid plist',
      plistSource: '<plist><dict>',
      pythonSource: validPython,
    },
  ])('rejects $name before replacing installed artifacts', fixtures => {
    const { installedPlist, installedPython, result } =
      installLaunchdFixtures(fixtures);

    expect(result.status).not.toBe(0);
    expect(readFileSync(installedPython, 'utf8')).toBe('ORIGINAL_PYTHON\n');
    expect(readFileSync(installedPlist, 'utf8')).toBe('ORIGINAL_PLIST\n');
  });

  it.each([
    'bootstrap-air.sh',
    'bootstrap-pro-launchd.sh',
  ])('%s installs launchd artifacts through the validated stage', bootstrapName => {
    const bootstrap = readFileSync(
      join(REPO_ROOT, 'scripts/hermes', bootstrapName),
      'utf8'
    );

    expect(bootstrap).toContain('source "$INSTALL_HELPER"');
    expect(bootstrap).toContain('hermes_create_launchd_stage');
    expect(bootstrap).toContain('hermes_install_validated_launchd_artifacts');
  });
});

describe('ship-loop pause semantics', () => {
  it('documents pause sentinels in the wrapper script', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/hermes/ship-loop.sh'),
      'utf8'
    );
    expect(script).toContain('HERMES_PAUSE');
    expect(script).toContain('shipping-paused');
    expect(script).toContain('${HERMES_HOME}/PAUSE');
    expect(script).toContain('codex-kanban-ship.py');
  });
});
