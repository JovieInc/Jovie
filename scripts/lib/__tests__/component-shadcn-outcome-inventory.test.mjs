import { describe, expect, it } from 'vitest';
import { runRenderedCertification } from '../../component-rendered-certification.mjs';
import {
  APPROVED_ENROLLMENT_BATCH_IDS,
  evaluateOutcomeInventory,
  evaluateOutcomeSample,
  listScalableOwners,
  OUTCOME_BATCH_SAMPLES,
  OUTCOME_INVENTORY,
  OUTCOME_INVENTORY_SCHEMA,
  OUTCOME_PROVENANCE,
  OUTCOME_RED_FIXTURES,
  runOutcomeCertification,
} from '../../component-shadcn-outcome-inventory.mjs';
import { runComponentShipGate } from '../../component-ship-gate.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone = value => structuredClone(value);
const details = result => result.findings.map(item => item.detail).join('\n');

describe('shadcn outcome inventory', () => {
  it('declares a scalable catalog while enrolling only the approved batch', () => {
    const catalog = listScalableOwners();
    const inventory = evaluateOutcomeInventory();
    expect(inventory.ok).toBe(true);
    expect(inventory.enrolledIds).toEqual([...APPROVED_ENROLLMENT_BATCH_IDS]);
    expect(catalog.length).toBeGreaterThan(inventory.enrolledIds.length);
    expect(inventory.unenrolledCount).toBeGreaterThan(0);
    expect(OUTCOME_PROVENANCE).toMatchObject({ license: 'MIT' });
    expect(OUTCOME_PROVENANCE.boundary).toMatch(/does not import/i);
    expect(OUTCOME_INVENTORY.schema).toBe(OUTCOME_INVENTORY_SCHEMA);
  });

  it('fails closed on missing or unknown applicable benchmark dimensions', () => {
    const sample = clone(OUTCOME_BATCH_SAMPLES[0]);
    sample.notApplicable = sample.notApplicable.filter(
      item => item.invariant !== 'keyboard-shortcut'
    );
    expect(details(evaluateOutcomeSample(sample))).toMatch(
      /neither applicable/
    );
    sample.applicable = [...sample.applicable, 'not-a-dimension'];
    expect(details(evaluateOutcomeSample(sample))).toMatch(
      /unknown applicable benchmark dimension/
    );
  });

  it('is source-blind and blocks select layout shift plus Typeset rhythm/overflow', () => {
    const select = clone(OUTCOME_RED_FIXTURES[0]);
    const withoutSource = evaluateOutcomeSample(select);
    select.source = 'export function Select() { return <div>Pro</div> }';
    expect(evaluateOutcomeSample(select).findings).toEqual(
      withoutSource.findings
    );
    expect(details(withoutSource)).toMatch(/shifted the trigger/);
    expect(details(withoutSource)).toMatch(/shifted siblings/);
    expect(details(withoutSource)).toMatch(/unknown layout contract unbounded/);
    expect(details(evaluateOutcomeSample(OUTCOME_RED_FIXTURES[1]))).toMatch(
      /Typeset rhythm[\s\S]*Typeset overflow "clip"[\s\S]*exceeds measure/
    );
  });

  it('emits pass/block receipts and refuses a green deliberate-red fixture', () => {
    const result = runOutcomeCertification({ headSha: HEAD });
    expect(result.ok).toBe(true);
    expect(
      result.receipt.fixtures.map(item => [item.id, item.verdict])
    ).toEqual([
      ['deliberate-red.select.layout-shift', 'block'],
      ['deliberate-red.typography.rhythm-overflow', 'block'],
    ]);
    expect(
      result.receipt.enrolledBatch.every(item => item.verdict === 'pass')
    ).toBe(true);
    const green = clone(OUTCOME_RED_FIXTURES[0]);
    green.nodes[0].geometry.triggerShiftPx = 0;
    Object.assign(green.nodes[1], {
      portal: true,
      layoutContract: 'bounded-local-disclosure',
    });
    green.nodes[1].geometry.triggerShiftPx = 0;
    green.nodes[1].geometry.siblingShiftPx = 0;
    green.nodes[2].geometry.siblingShiftPx = 0;
    expect(
      runOutcomeCertification({ headSha: HEAD, redFixtures: [green] }).ok
    ).toBe(false);
  });

  it('refuses unapproved enrollment and forbidden implementation imports', () => {
    const extra = clone(OUTCOME_INVENTORY);
    extra.entries.push({ ...extra.entries[0], id: 'atom.alert-dialog' });
    expect(
      evaluateOutcomeInventory({ inventory: extra }).issues.join('\n')
    ).toMatch(/unapproved enrollment/);
    const imported = clone(OUTCOME_INVENTORY);
    imported.entries[0].source =
      'scripts/lib/__tests__/fixtures/forbidden-shadcn-import.fixture.txt';
    expect(
      evaluateOutcomeInventory({ inventory: imported }).issues.join('\n')
    ).toMatch(/forbidden Shadcn\/Typeset implementation import/);
  });
});

describe('shadcn outcome inventory composition', () => {
  it('extends rendered certification and the existing ship gate', () => {
    const rendered = runRenderedCertification({ headSha: HEAD });
    expect(rendered.ok).toBe(true);
    expect(rendered.receipt.shadcnOutcome).toMatchObject({
      schema: OUTCOME_INVENTORY_SCHEMA,
      gate: 'component-ship-gate',
      section: 'shadcnOutcome',
      ok: true,
    });
    expect(rendered.receipt.landingBatch).toHaveLength(4);
    expect(rendered.receipt.fixtures).toHaveLength(3);
    const report = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      headSha: HEAD,
    });
    expect(report.ok).toBe(true);
    expect(report.sections.renderedCertification.receipt.shadcnOutcome.ok).toBe(
      true
    );
  });
});
