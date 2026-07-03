import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

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
  it('documents gbrain and grok preflight gates', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/hermes/shipper-gated-entrypoint.py'),
      'utf8'
    );
    expect(script).toContain('gbrain_alive');
    expect(script).toContain('grok_ready');
    expect(script).toContain('codex-issue-shipper.ts');
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
