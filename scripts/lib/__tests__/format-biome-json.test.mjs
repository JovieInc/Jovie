import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatBiomeJson } from '../format-biome-json.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BIOME = resolve(REPO_ROOT, 'node_modules/@biomejs/biome/bin/biome');

function biomeAccepts(text) {
  const dir = mkdtempSync(join(tmpdir(), 'biome-json-'));
  const path = join(dir, 'sample.json');
  writeFileSync(path, text);
  execFileSync(BIOME, ['check', path], { encoding: 'utf8' });
}

describe('formatBiomeJson', () => {
  it('collapses a primitive array onto one line when that line fits in 80 columns', () => {
    const value = {
      growthTrend: 'unknown',
      regressions: ['lead_time.codex.p95', 'remediation.main_red_to_green.p95'],
      flatStall: false,
    };
    const formatted = formatBiomeJson(value);
    const expanded = `${JSON.stringify(value, null, 2)}\n`;

    assert.notEqual(formatted, expanded);
    assert.match(
      formatted,
      /"regressions": \["lead_time\.codex\.p95", "remediation\.main_red_to_green\.p95"\],/
    );
    biomeAccepts(formatted);
    assert.equal(formatBiomeJson(JSON.parse(formatted)), formatted);
  });

  it('keeps a primitive array expanded when the single line would pass 80 columns', () => {
    const fitting = 'a'.repeat(80 - '  "regressions": [""],'.length);
    const overflowing = `${fitting}a`;
    const fit = formatBiomeJson({
      regressions: [fitting],
      flatStall: false,
    });
    const overflow = formatBiomeJson({
      regressions: [overflowing],
      flatStall: false,
    });

    assert.match(fit, new RegExp(`"regressions": \\["${fitting}"\\],`));
    assert.match(overflow, new RegExp(`\\[\n\\s+"${overflowing}"\n\\s+\\],`));
    biomeAccepts(fit);
    biomeAccepts(overflow);
  });

  it('collapses nested primitive arrays and leaves object layout expanded', () => {
    const formatted = formatBiomeJson({
      samples: [
        {
          selectedChecks: ['Blog Content Qualification', 'Golden Path Lock'],
        },
      ],
    });

    assert.match(
      formatted,
      /"selectedChecks": \["Blog Content Qualification", "Golden Path Lock"\]/
    );
    assert.match(formatted, /"samples": \[\n/);
    biomeAccepts(formatted);
  });

  it('keeps the committed snapshots in the shape Biome already accepts', () => {
    for (const relative of [
      'docs/metrics/shipping-slo-latest.json',
      'docs/metrics/blog-publish-latency-latest.json',
    ]) {
      const text = readFileSync(resolve(REPO_ROOT, relative), 'utf8');
      assert.equal(formatBiomeJson(JSON.parse(text)), text, relative);
      biomeAccepts(text);
    }

    // The baseline comment stores the arrow as \u2192. JSON.stringify prints
    // the character, and no primitive array in that document collapses.
    const baseline = readFileSync(
      resolve(REPO_ROOT, 'docs/metrics/shipping-slo-baseline.json'),
      'utf8'
    );
    const parsed = JSON.parse(baseline);
    assert.equal(
      formatBiomeJson(parsed),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
    biomeAccepts(baseline);
    biomeAccepts(formatBiomeJson(parsed));
  });
});
