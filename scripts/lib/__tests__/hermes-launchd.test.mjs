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

    expect(rendered).toContain('<string>co.jovie.hermes.cron-codex-kanban-ship</string>');
    expect(rendered).toContain('<integer>900</integer>');
    expect(rendered).toContain('/Users/tester/Jovie/scripts/hermes/ship-loop.sh');
    expect(rendered).toContain('/Users/tester/.hermes/logs/launchd/cron-codex-kanban-ship.log');
    expect(rendered).toContain('<key>HERMES_SHIP</key>');
  });
});

describe('codex issue shipper launchd template', () => {
  it('renders shipper plist with gated entrypoint and 15m schedule', () => {
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