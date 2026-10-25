/**
 * Ratchet for the closed-loop contract: every loop definition in
 * scripts/loops/*.mjs must be wired end to end (clock, event-only workflow,
 * registry row with a dwell SLO and dead-man heartbeat) and may never loosen a
 * threshold below its committed floor.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../automation-registry.mjs';
import { LOOP_KEY_RE } from '../loop-health.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const loopsDir = join(repoRoot, 'scripts/loops');
const registry = loadRegistry(repoRoot);
const floor = JSON.parse(
  readFileSync(join(loopsDir, 'thresholds.floor.json'), 'utf8')
);
const clockSource = readFileSync(
  join(repoRoot, 'scripts/lanes/continuity_clock.py'),
  'utf8'
);

const loopFiles = readdirSync(loopsDir).filter(name => name.endsWith('.mjs'));
const defs = await Promise.all(
  loopFiles.map(
    async file =>
      (await import(pathToFileURL(join(loopsDir, file)).href)).default
  )
);

describe('closed-loop definitions', () => {
  it('has at least one loop', () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  for (const def of defs) {
    describe(def.key, () => {
      const snake = def.key.replaceAll('-', '_');
      const workflowFile = `.github/workflows/loop-health-${def.key}.yml`;
      const row = registry.entries.find(
        e => e.id === `lanes-clock:loop-health-${def.key}`
      );

      it('declares owner, copy, re-measure command and dwell SLO', () => {
        expect(def.key).toMatch(LOOP_KEY_RE);
        for (const field of [
          'title',
          'owner',
          'source',
          'summary',
          'whyItMatters',
          'remeasure',
        ]) {
          expect(typeof def[field], field).toBe('string');
          expect(def[field].length, field).toBeGreaterThan(5);
        }
        expect(
          Number.isInteger(def.dwellSloMinutes) && def.dwellSloMinutes > 0
        ).toBe(true);
        expect(typeof def.collect).toBe('function');
        expect(def.remeasure).toContain(`--loop ${def.key}`);
      });

      it('every rule has a threshold at least as strict as its floor', () => {
        expect(def.rules.length).toBeGreaterThan(0);
        const floorRules = floor[def.key];
        expect(
          floorRules,
          `${def.key} missing from thresholds.floor.json`
        ).toBeTruthy();
        for (const rule of def.rules) {
          expect(['max', 'min']).toContain(rule.op);
          expect(Number.isFinite(rule.threshold)).toBe(true);
          const limit = floorRules[rule.id];
          expect(limit, `rule ${rule.id} missing from floor`).toBeTruthy();
          expect(rule.op).toBe(limit.op);
          if (rule.op === 'max')
            expect(rule.threshold).toBeLessThanOrEqual(limit.threshold);
          else expect(rule.threshold).toBeGreaterThanOrEqual(limit.threshold);
        }
        for (const id of Object.keys(floorRules)) {
          expect(
            def.rules.some(r => r.id === id),
            `floor rule ${id} was removed`
          ).toBe(true);
        }
      });

      it('has an event-only workflow fired by a lanes clock', () => {
        expect(existsSync(join(repoRoot, workflowFile))).toBe(true);
        const workflow = readFileSync(join(repoRoot, workflowFile), 'utf8');
        expect(workflow).toContain(`types: [clock_loop_health_${snake}]`);
        expect(workflow).toContain(`--loop ${def.key}`);
        // JOV-INV-042: no GitHub cron; the lanes clock is the only scheduler.
        expect(workflow).not.toMatch(/^\s*-\s*cron:/m);
        expect(clockSource).toContain(`"clock_loop_health_${snake}"`);
        expect(clockSource).toContain(`"loop-health-${def.key}.yml"`);
      });

      it('has a registry row with dwell SLO and dead-man liveness', () => {
        expect(row, 'registry row missing').toBeTruthy();
        expect(row.status).toBe('live');
        expect(row.dwellSloMinutes).toBe(def.dwellSloMinutes);
        expect(row.receipt.kind).toBe('github-workflow');
        expect(row.receipt.workflow).toBe(`loop-health-${def.key}.yml`);
        expect(row.critical).toBe(true);
        expect(row.heartbeat.maxSilenceMinutes).toBeGreaterThan(0);
        expect(row.heartbeat.escalationOwner).toBeTruthy();
        // A missed run must go red well inside two cadences.
        expect(row.maxStalenessMinutes).toBeGreaterThanOrEqual(
          def.dwellSloMinutes
        );
      });
    });
  }
});
