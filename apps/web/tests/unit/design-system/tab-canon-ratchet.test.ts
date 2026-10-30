import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findDuplicateFields, findTabOffenders } from './tab-canon-scan';

interface Baseline {
  readonly tabOffenders: readonly string[];
  readonly duplicateFields: readonly string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const baseline = JSON.parse(
  readFileSync(join(__dirname, 'tab-canon.baseline.json'), 'utf8')
) as Baseline;

describe('Tab canon and single-field ratchet (shrink-only)', () => {
  it('builds tabs only from the canonical pill segmented control', {
    timeout: 60_000,
  }, () => {
    const allowed = new Set(baseline.tabOffenders);
    const fresh = findTabOffenders(WEB_ROOT).filter(f => !allowed.has(f));
    expect(
      fresh,
      'New tab UI must use TabBar / DrawerTabs / DrawerTabStrip / InspectorTabs (pill segmented control), not hand-rolled role="tab" markup.'
    ).toEqual([]);
  });

  it('renders each field once per panel', { timeout: 60_000 }, () => {
    const allowed = new Set(baseline.duplicateFields);
    const fresh = findDuplicateFields(WEB_ROOT).filter(f => !allowed.has(f));
    expect(
      fresh,
      'A fact row label repeats, or matches a section title, in one file. Show each fact once (or mark exclusive branches with field-once-ok).'
    ).toEqual([]);
  });

  it('only ever shrinks the baseline', { timeout: 60_000 }, () => {
    const tabs = new Set(findTabOffenders(WEB_ROOT));
    const dups = new Set(findDuplicateFields(WEB_ROOT));
    expect(
      baseline.tabOffenders.filter(f => !tabs.has(f)),
      'Fixed offenders must be removed from tab-canon.baseline.json.'
    ).toEqual([]);
    expect(
      baseline.duplicateFields.filter(f => !dups.has(f)),
      'Fixed duplicates must be removed from tab-canon.baseline.json.'
    ).toEqual([]);
  });
});
