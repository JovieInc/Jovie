import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildGBrainHealthSummary,
  collectGBrainHealthSummary,
  type GBrainExec,
} from '../../jobs/gbrain-health-summary';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/gbrain-server-recovery.md'
);

const GBRAIN_SERVER_PLIST_TEMPLATE = resolve(
  process.cwd(),
  'scripts/symphony/launchd/co.jovie.hermes.gbrain-server.plist.template'
);

const REQUIRED_SECTIONS = [
  'Safe stop',
  'Inspect current state',
  'Quarantine',
  'Replay or resume',
  'Reconcile',
  'Restore',
  'Verify recovery',
  'Communicate',
  'Audit trail',
  'Runbook freshness',
];

describe('gbrain server recovery runbook', () => {
  it('exists and contains the required recovery sections', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    for (const section of REQUIRED_SECTIONS) {
      expect(runbook).toContain(section);
    }
  });

  it('references only repo-relative paths that exist', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    const matches = [
      ...runbook.matchAll(
        /(?:^|[\s`'"(])scripts\/symphony\/[\w./-]+(?:\.\w+)?/gm
      ),
    ];

    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const referencedPath = match[0].trim();
      const trimmedPath = referencedPath.replace(/^[\s`'"(]+/, '');
      const absolutePath = resolve(process.cwd(), trimmedPath);
      expect
        .soft(absolutePath, `runbook references missing path: ${trimmedPath}`)
        .toBeTruthy();
      if (trimmedPath.includes('.')) {
        expect
          .soft(
            require('node:fs').existsSync(absolutePath),
            `runbook references missing file: ${trimmedPath}`
          )
          .toBe(true);
      }
    }
  });

  it('proves the gbrain server plist template binds serve --http on Tailscale', () => {
    const template = readFileSync(GBRAIN_SERVER_PLIST_TEMPLATE, 'utf8');
    expect(template).toContain('co.jovie.hermes.gbrain-server');
    expect(template).toContain('{{GBRAIN_BIN}}');
    expect(template).toContain('serve');
    expect(template).toContain('--http');
    expect(template).toContain('{{TAILSCALE_IP}}');
    expect(template).toContain('7801');
    expect(template).toContain('KeepAlive');
  });

  it('proves a fully passing health summary is healthy', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const summary = buildGBrainHealthSummary({
      generatedAt: now.toISOString(),
      checks: [
        { name: 'http-health', ok: true, detail: 'ok', durationMs: 12 },
        { name: 'doctor', ok: true, detail: 'status=ok', durationMs: 34, required: false },
        { name: 'source-freshness', ok: true, detail: 'fresh', durationMs: 56 },
        { name: 'serve-processes', ok: true, detail: 'one process', durationMs: 7 },
      ],
    });
    expect(summary.status).toBe('healthy');
    expect(summary.recommendation).toContain('No operator action');
  });

  it('proves a failing required check degrades the summary and authorizes recovery', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const exec: GBrainExec = (_file, args) => {
      const command = args.join(' ');
      if (command.includes('/health')) return '{"status":"ok"}';
      if (command.includes('doctor')) return '{"status":"ok"}';
      if (command.includes('sources')) return '{"sources":[]}';
      if (command.includes('pgrep')) return '';
      throw new Error(`unexpected exec: ${command}`);
    };
    const summary = collectGBrainHealthSummary({ exec, now });
    expect(summary.status).toBe('degraded');
    const serveCheck = summary.checks.find(c => c.name === 'serve-processes');
    expect(serveCheck).toBeDefined();
    expect(serveCheck!.ok).toBe(false);
    expect(summary.recommendation).toContain('gbrain serve launchd status');
  });

  it('proves all required checks failing marks the summary down', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const exec: GBrainExec = () => {
      throw new Error('gbrain unavailable');
    };
    const summary = collectGBrainHealthSummary({ exec, now });
    expect(summary.status).toBe('down');
    const failed = summary.checks.filter(c => c.required !== false && !c.ok);
    expect(failed.length).toBeGreaterThan(0);
  });
});
