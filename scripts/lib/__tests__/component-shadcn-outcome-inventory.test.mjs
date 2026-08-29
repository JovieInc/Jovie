import { describe, expect, it } from 'vitest';
import { runRenderedCertification } from '../../component-rendered-certification.mjs';
import {
  APPROVED_ENROLLMENT_BATCH_IDS,
  APPROVED_ENROLLMENT_BATCH_IDS_BY_BATCH,
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
const certificationIssues = options => {
  const result = runOutcomeCertification(options);
  expect(result.ok).toBe(false);
  return result.receipt.issues.join('\n');
};

describe('shadcn outcome inventory', () => {
  it('declares a scalable catalog while enrolling only the approved batch', () => {
    const catalog = listScalableOwners();
    const inventory = evaluateOutcomeInventory();
    expect(inventory.ok).toBe(true);
    expect([...inventory.enrolledIds].sort()).toEqual(
      [...APPROVED_ENROLLMENT_BATCH_IDS].sort()
    );
    expect(APPROVED_ENROLLMENT_BATCH_IDS_BY_BATCH['batch-2']).toEqual([
      'atom.input',
      'atom.textarea',
      'atom.checkbox',
      'atom.radio-group',
      'atom.native-select',
    ]);
    expect(catalog.length).toBeGreaterThan(inventory.enrolledIds.length);
    expect(inventory.unenrolledCount).toBeGreaterThan(0);
    expect(OUTCOME_PROVENANCE).toMatchObject({ license: 'MIT' });
    expect(OUTCOME_PROVENANCE.boundary).toMatch(/does not import/i);
    expect(OUTCOME_INVENTORY.schema).toBe(OUTCOME_INVENTORY_SCHEMA);

    // biome-ignore format: both fabricated and duplicate provenance must fail closed.
    const provenanceMutations = [
      provenance => Object.assign(provenance, { license: 'MIT', boundary: 'does not import anything', references: [{ name: 'fabricated reference' }] }),
      provenance => { provenance.references = Array(3).fill(clone(OUTCOME_PROVENANCE.references[0])); },
    ];
    for (const mutate of provenanceMutations) {
      const candidate = clone(OUTCOME_INVENTORY);
      mutate(candidate.provenance);
      expect(
        evaluateOutcomeInventory({ inventory: candidate }).issues
      ).toContain(
        'provenance must exactly match the approved MIT public-reference and no-import boundary'
      );
    }

    const wrongBatch = clone(OUTCOME_INVENTORY);
    // biome-ignore format: keep the exact batch-tamper assertion compact.
    wrongBatch.entries.find(entry => entry.id === 'atom.input').enrollmentBatch = 'batch-1';
    expect(
      evaluateOutcomeInventory({ inventory: wrongBatch }).issues
    ).toContain('atom.input: enrollment batch must be batch-2');
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
    expect(result.receipt.enrollmentBatches[1]).toEqual({
      id: 'batch-2',
      ownerIds: [...APPROVED_ENROLLMENT_BATCH_IDS_BY_BATCH['batch-2']],
    });
    expect(result.receipt).toMatchObject({
      claimBoundary: 'rubric-and-evaluator-qualification-only',
      liveVisualCertification: {
        status: 'not-started',
        certified: 0,
        productContexts: ['artist-profiles', 'smart-links', 'embedded-mobile'],
        contextEvidence: [],
      },
    });
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
    expect(certificationIssues({ redFixtures: [null] })).toMatch(
      /deliberate-red\.select\.layout-shift: deliberate-red contract requires exactly one fixture; found 0[\s\S]*unknown fixture: deliberate-red fixture has no approved contract/
    );

    const partlyHealed = clone(OUTCOME_RED_FIXTURES[0]);
    partlyHealed.nodes[0].geometry.triggerShiftPx = 0;
    expect(
      certificationIssues({
        redFixtures: [partlyHealed, OUTCOME_RED_FIXTURES[1]],
      })
    ).toContain(
      'deliberate-red.select.layout-shift: deliberate-red fixture must match its approved contract and exact fingerprints'
    );
  });

  it('requires exactly one source-blind outcome sample per enrolled owner', () => {
    // biome-ignore format: option -> required fail-closed fingerprint.
    const malformedCases = [
      { options: { enrolledBatch: OUTCOME_BATCH_SAMPLES.filter(sample => sample.owner !== 'atom.input') }, fingerprint: /atom\.input: enrolled outcome owner requires exactly one batch sample; found 0/ },
      { options: { enrolledBatch: [...OUTCOME_BATCH_SAMPLES, OUTCOME_BATCH_SAMPLES[0]] }, fingerprint: /atom\.select: enrolled outcome owner requires exactly one batch sample; found 2/ },
      { options: { enrolledBatch: {} }, fingerprint: /outcome enrolled-batch samples must be an array; fail closed/ },
      { options: { enrolledBatch: [null] }, fingerprint: /outcome batch sample must be an object; fail closed/ },
    ];
    for (const { options, fingerprint } of malformedCases) {
      expect(certificationIssues(options)).toMatch(fingerprint);
    }

    const forged = OUTCOME_BATCH_SAMPLES.map(sample => ({
      ...clone(sample),
      applicable: [],
      notApplicable: [
        ...sample.notApplicable,
        ...sample.applicable.map(invariant => ({
          invariant,
          reason: 'forged self-declared exemption',
        })),
      ],
      nodes: [{}],
    }));
    expect(certificationIssues({ enrolledBatch: forged })).toContain(
      'outcome-batch.atom.select.closed-open: applicable dimensions contradict the approved sample contract'
    );

    for (const malformedOptions of [true, [], null]) {
      expect(certificationIssues(malformedOptions)).toContain(
        'outcome certification options must be an object; fail closed'
      );
      expect(evaluateOutcomeInventory(malformedOptions).ok).toBe(false);
    }

    const symbolicContext = [
      {
        ...OUTCOME_BATCH_SAMPLES[0],
        productContexts: [Symbol('forged-context')],
      },
      ...OUTCOME_BATCH_SAMPLES.slice(1),
    ];
    expect(certificationIssues({ enrolledBatch: symbolicContext })).toContain(
      'outcome-batch.atom.select.closed-open: outcome batch sample must name every approved Jovie product context'
    );
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

  it('blocks a valid outcome mutation that contradicts the nested comparative receipt', () => {
    const contradictory = clone(OUTCOME_INVENTORY);
    contradictory.entries.find(
      entry => entry.id === 'atom.select'
    ).disposition = 'keep';
    const result = runOutcomeCertification({ inventory: contradictory });
    expect(result.ok).toBe(false);
    expect(result.receipt.comparativeQualityBar.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toContain(
      'comparative quality bar: atom.select: approved Shadcn outcome contradicts the comparative registry'
    );
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
