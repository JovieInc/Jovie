import { describe, expect, it } from 'vitest';
import {
  ATOM_MOLECULE_INVENTORY_RATCHET,
  COMPARATIVE_DELIBERATE_RED_FIXTURES,
  COMPARATIVE_QUALIFICATION_CONTROLS,
  COMPARATIVE_QUALITY_BAR,
  COMPARATIVE_QUALITY_BAR_SCHEMA,
  DELIBERATE_RED_CONTRACTS,
  discoverAtomMoleculeInventory,
  evaluateAtomMoleculeInventory,
  evaluateComparativeSample,
  proposeAtomMoleculeInventoryRatchet,
  QUALITY_BAR_REFERENCES,
  runComparativeQualityBar,
  validateApprovedOutcomeAlignment,
  validateComparativeQualityBar,
  validateDimensionRequirements,
} from '../../component-comparative-quality-bar.mjs';
import { OUTCOME_INVENTORY } from '../../component-shadcn-outcome-inventory.mjs';

const clone = value => structuredClone(value);
const details = result => result.findings.map(item => item.detail).join('\n');
const controlFor = baselineId =>
  COMPARATIVE_QUALIFICATION_CONTROLS.find(
    control => control.baselineId === baselineId
  );
const redFor = baselineId =>
  COMPARATIVE_DELIBERATE_RED_FIXTURES.find(
    fixture => fixture.baselineId === baselineId
  );

describe('component comparative quality bar', () => {
  it('extends the approved Shadcn outcome batch without a second contradictory registry', () => {
    const approved = new Map(
      OUTCOME_INVENTORY.entries.map(entry => [entry.id, entry])
    );
    expect(COMPARATIVE_QUALITY_BAR.map(entry => entry.id).sort()).toEqual(
      [...approved.keys()].sort()
    );
    for (const baseline of COMPARATIVE_QUALITY_BAR) {
      expect(baseline).toMatchObject({
        layer: approved.get(baseline.id).layer,
        disposition: approved.get(baseline.id).disposition,
        owner: { sourcePath: approved.get(baseline.id).source },
      });
    }
    expect(validateApprovedOutcomeAlignment(OUTCOME_INVENTORY.entries)).toEqual(
      []
    );
  });

  it('blocks a runtime outcome inventory that contradicts the comparative receipt', () => {
    const entries = clone(OUTCOME_INVENTORY.entries);
    entries.find(entry => entry.id === 'atom.select').disposition = 'keep';
    expect(validateApprovedOutcomeAlignment(entries)).toContain(
      'atom.select: approved Shadcn outcome contradicts the comparative registry'
    );
    const result = runComparativeQualityBar({
      approvedOutcomeEntries: entries,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toContain(
      'atom.select: approved Shadcn outcome contradicts the comparative registry'
    );
  });

  it('records the outcome-only provenance and license boundary', () => {
    expect(validateComparativeQualityBar()).toEqual([]);
    expect(QUALITY_BAR_REFERENCES['shadcn-components']).toMatchObject({
      useBoundary: 'outcome-reference-only',
      sourceImported: false,
      license: { spdx: 'MIT' },
    });
    expect(QUALITY_BAR_REFERENCES['shadcn-typeset']).toMatchObject({
      useBoundary: 'concept-and-test-dimension-only',
      sourceImported: false,
      license: { spdx: 'MIT' },
    });
    const select = COMPARATIVE_QUALITY_BAR.find(
      item => item.id === 'atom.select'
    );
    expect(Object.isFrozen(select.requirements)).toBe(true);
    expect(Object.isFrozen(select.requiredDimensions)).toBe(true);
    expect(() => {
      select.requirements.minHitTargetPx = 1;
    }).toThrow();
  });

  it('inventories every current atom and molecule without silently enrolling it', () => {
    const inventory = discoverAtomMoleculeInventory();
    const sources = inventory.map(item => item.sourcePath);
    expect(inventory).toHaveLength(
      ATOM_MOLECULE_INVENTORY_RATCHET.reduce(
        (total, root) => total + root.total,
        0
      )
    );
    expect(new Set(sources).size).toBe(inventory.length);
    expect(
      inventory.every(item =>
        ['rubric-enrolled', 'pending-comparison'].includes(
          item.comparisonStatus
        )
      )
    ).toBe(true);
    expect(
      inventory.find(item => item.sourcePath === 'packages/ui/atoms/select.tsx')
    ).toMatchObject({
      layer: 'atom',
      comparisonStatus: 'rubric-enrolled',
      baselineId: 'atom.select',
    });
    expect(
      inventory.some(item => item.comparisonStatus === 'pending-comparison')
    ).toBe(true);
    expect(
      inventory.find(
        item =>
          item.sourcePath ===
          'apps/web/components/features/auth/atoms/AuthTextInput.tsx'
      )
    ).toMatchObject({
      root: 'apps/web/components/**/atoms',
      layer: 'atom',
      comparisonStatus: 'pending-comparison',
    });
    expect(evaluateAtomMoleculeInventory(inventory).ok).toBe(true);
    expect(proposeAtomMoleculeInventoryRatchet()).toEqual(
      ATOM_MOLECULE_INVENTORY_RATCHET
    );
  });

  it('enrolls the canonical form-control family in the closed-world inventory', () => {
    const inventory = discoverAtomMoleculeInventory();
    for (const [sourcePath, baselineId] of [
      ['packages/ui/atoms/input.tsx', 'atom.input'],
      ['packages/ui/atoms/textarea.tsx', 'atom.textarea'],
      ['packages/ui/atoms/checkbox.tsx', 'atom.checkbox'],
      ['packages/ui/atoms/radio-group.tsx', 'atom.radio-group'],
      ['packages/ui/atoms/native-select.tsx', 'atom.native-select'],
    ]) {
      expect(
        inventory.find(item => item.sourcePath === sourcePath)
      ).toMatchObject({
        layer: 'atom',
        comparisonStatus: 'rubric-enrolled',
        baselineId,
      });
    }
    const result = runComparativeQualityBar();
    expect(result.ok).toBe(true);
    expect(
      COMPARATIVE_QUALITY_BAR.filter(item =>
        [
          'atom.input',
          'atom.textarea',
          'atom.checkbox',
          'atom.radio-group',
          'atom.native-select',
        ].includes(item.id)
      ).every(
        item =>
          item.enrolled === true &&
          item.referenceUrl.startsWith(
            'https://ui.shadcn.com/docs/components/base/'
          ) &&
          QUALITY_BAR_REFERENCES[item.referenceId].sourceImported === false
      )
    ).toBe(true);
  });

  it('fails when any nested atom/molecule source silently leaves the inventory', () => {
    const inventory = discoverAtomMoleculeInventory();
    const withoutNestedFeatureAtom = inventory.filter(
      item =>
        item.sourcePath !==
        'apps/web/components/features/auth/atoms/AuthTextInput.tsx'
    );
    const result = evaluateAtomMoleculeInventory(withoutNestedFeatureAtom);
    const webAtoms = ATOM_MOLECULE_INVENTORY_RATCHET.find(
      item => item.root === 'apps/web/components/**/atoms'
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain(
      `apps/web/components/**/atoms: inventory ratchet changed (${webAtoms.total - 1}/${webAtoms.total}`
    );
  });

  it('rejects inventory entries outside the approved closed-world roots', () => {
    const inventory = discoverAtomMoleculeInventory();
    const expectedTotal = ATOM_MOLECULE_INVENTORY_RATCHET.reduce(
      (total, root) => total + root.total,
      0
    );
    const result = evaluateAtomMoleculeInventory([
      ...inventory,
      {
        layer: 'atom',
        root: 'unknown',
        sourcePath: 'unknown/atom.tsx',
        comparisonStatus: 'pending-comparison',
        baselineId: null,
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(
      new RegExp(
        `contains unknown roots: unknown[\\s\\S]*total differs from the approved ratchet \\(${expectedTotal + 1}/${expectedTotal}\\)`
      )
    );
  });

  it('turns malformed inventory entries into failures instead of throwing', () => {
    const inventory = clone(discoverAtomMoleculeInventory());
    inventory[0] = null;
    const result = runComparativeQualityBar({ inventory });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /contains unknown roots: undefined[\s\S]*inventory ratchet changed/
    );
  });

  it('rejects an enrolled component whose discovered layer contradicts its baseline', () => {
    const inventory = clone(discoverAtomMoleculeInventory());
    const select = inventory.find(item => item.baselineId === 'atom.select');
    select.layer = 'molecule';
    const result = runComparativeQualityBar({ inventory });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toContain(
      'atom.select: rubric enrollment must resolve to exactly one inventory entry; found 0'
    );
  });

  it('rejects falsified pending and enrollment metadata without a path change', () => {
    const pendingInventory = clone(discoverAtomMoleculeInventory());
    const pending = pendingInventory.find(
      item => item.comparisonStatus === 'pending-comparison'
    );
    pending.layer = 'foundation';
    pending.baselineId = 'atom.fake';
    const pendingResult = runComparativeQualityBar({
      inventory: pendingInventory,
    });
    expect(pendingResult.ok).toBe(false);
    expect(pendingResult.receipt.issues.join('\n')).toMatch(
      /inventory layer foundation does not match root[\s\S]*pending comparison requires baselineId=null/
    );

    const enrolledInventory = clone(discoverAtomMoleculeInventory());
    const enrolled = enrolledInventory.find(
      item => item.comparisonStatus === 'pending-comparison'
    );
    enrolled.comparisonStatus = 'rubric-enrolled';
    enrolled.baselineId = 'atom.fake';
    const enrolledResult = runComparativeQualityBar({
      inventory: enrolledInventory,
    });
    expect(enrolledResult.ok).toBe(false);
    expect(enrolledResult.receipt.issues.join('\n')).toContain(
      `${enrolled.sourcePath}: rubric enrollment has no known baseline`
    );
  });

  it('is source-blind and fails closed on missing or unknown dimensions', () => {
    const sample = clone(controlFor('atom.select'));
    const expected = evaluateComparativeSample(sample);
    sample.source = '<SelectTrigger className="whatever" />';
    expect(evaluateComparativeSample(sample)).toEqual(expected);

    delete sample.observations['layout-stability'];
    expect(evaluateComparativeSample(sample).ok).toBe(false);
    expect(details(evaluateComparativeSample(sample))).toMatch(
      /observation is missing/
    );

    sample.observations['visual-sameness'] = { required: true };
    expect(details(evaluateComparativeSample(sample))).toMatch(
      /unknown dimension: visual-sameness/
    );
  });

  it('blocks real select layout shift and Typeset rhythm/overflow regressions', () => {
    const select = evaluateComparativeSample(redFor('atom.select'));
    expect(select.ok).toBe(false);
    expect(details(select)).toMatch(
      /bounding box changed[\s\S]*unrelated content shifted/
    );

    const typesetFixture = COMPARATIVE_DELIBERATE_RED_FIXTURES.find(
      item => item.baselineId === 'typography.system-b'
    );
    const typeset = evaluateComparativeSample(typesetFixture);
    expect(typeset.ok).toBe(false);
    expect(details(typeset)).toMatch(
      /skips a level[\s\S]*below 15px[\s\S]*exceeds 80ch[\s\S]*escapes[\s\S]*appending content/
    );
  });

  it('emits an inventory, benchmark, deliberate-red, and qualification receipt', () => {
    const result = runComparativeQualityBar();
    expect(result.ok).toBe(true);
    expect(result.receipt).toMatchObject({
      schema: COMPARATIVE_QUALITY_BAR_SCHEMA,
      ok: true,
      inventory: {
        total: expect.any(Number),
        rubricEnrolled: 12,
        pendingComparison: expect.any(Number),
      },
    });
    expect(result.receipt.fixtures).toHaveLength(
      COMPARATIVE_QUALITY_BAR.length
    );
    expect(
      result.receipt.fixtures.every(item => item.verdict === 'block')
    ).toBe(true);
    expect(result.receipt).toMatchObject({
      claimBoundary: 'rubric-and-evaluator-qualification-only',
      liveVisualCertification: { status: 'not-started', certified: 0 },
    });
    expect(result.receipt.qualificationControls).toHaveLength(
      COMPARATIVE_QUALITY_BAR.length
    );
    expect(
      result.receipt.qualificationControls.every(
        item => item.verdict === 'pass'
      )
    ).toBe(true);
  });

  it('fails if a deliberate-red sample stops proving the gate', () => {
    const leaked = {
      ...clone(redFor('atom.select')),
      observations: clone(controlFor('atom.select').observations),
    };
    const result = runComparativeQualityBar({
      redFixtures: COMPARATIVE_DELIBERATE_RED_FIXTURES.map(fixture =>
        fixture.id === leaked.id ? leaked : fixture
      ),
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /deliberate-red fixture must block/
    );
  });

  it('requires exactly one qualification control for every enrolled baseline', () => {
    const missing = runComparativeQualityBar({
      qualificationControls: COMPARATIVE_QUALIFICATION_CONTROLS.slice(1),
    });
    expect(missing.ok).toBe(false);
    expect(missing.receipt.issues.join('\n')).toMatch(
      /atom\.select: enrolled baseline requires exactly one qualification control; found 0/
    );

    const duplicate = runComparativeQualityBar({
      qualificationControls: [
        ...COMPARATIVE_QUALIFICATION_CONTROLS,
        controlFor('atom.select'),
      ],
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.receipt.issues.join('\n')).toMatch(
      /atom\.select: enrolled baseline requires exactly one qualification control; found 2/
    );
  });

  it('binds each qualification control to a unique canonical id', () => {
    const controls = clone(COMPARATIVE_QUALIFICATION_CONTROLS);
    const button = controls.find(
      control => control.baselineId === 'atom.button'
    );
    button.id = 'qualification-control.atom.select';
    const result = runComparativeQualityBar({
      qualificationControls: controls,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /qualification-control\.atom\.select: qualification control id must be qualification-control\.atom\.button[\s\S]*duplicate qualification control id/
    );
  });

  it('fails closed when required numeric observations are absent', () => {
    const button = clone(controlFor('atom.button'));
    delete button.observations['action-hierarchy'].primaryCount;
    delete button.observations['responsive-fit'].minHitTargetPx;
    const buttonResult = evaluateComparativeSample(button);
    expect(buttonResult.ok).toBe(false);
    expect(details(buttonResult)).toMatch(
      /primary action count is not proved[\s\S]*minimum hit target is not proved/
    );

    const typeset = clone(controlFor('typography.system-b'));
    delete typeset.observations['typography-rhythm'].mobileBodyPx;
    delete typeset.observations['typography-rhythm'].lineHeight;
    delete typeset.observations['typography-rhythm'].measureCh;
    const typesetResult = evaluateComparativeSample(typeset);
    expect(typesetResult.ok).toBe(false);
    expect(details(typesetResult)).toMatch(
      /mobile body size is not proved[\s\S]*line height is not proved[\s\S]*measure is not proved/
    );
  });

  it('requires a live deliberate-red proof set', () => {
    const result = runComparativeQualityBar({ redFixtures: [] });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /deliberate-red fixture set is empty/
    );
  });

  it('rejects non-finite, negative, and structurally incomplete observations', () => {
    const select = clone(controlFor('atom.select'));
    select.observations['layout-stability'].before = {};
    select.observations['layout-stability'].after = {};
    select.observations['layout-stability'].unrelatedShiftPx = Number.NaN;
    select.observations['responsive-fit'].viewportWidth =
      Number.POSITIVE_INFINITY;
    expect(details(evaluateComparativeSample(select))).toMatch(
      /bounding box changed[\s\S]*unrelated content shifted[\s\S]*horizontal document overflow/
    );

    const typeset = clone(controlFor('typography.system-b'));
    typeset.observations['copy-density'].visibleWords = -1;
    typeset.observations['content-overflow'] = { documentOverflowPx: 0 };
    typeset.observations['append-stability'] = {
      priorBlockGeometryDeltaPx: 0,
    };
    expect(details(evaluateComparativeSample(typeset))).toMatch(
      /visible word count is not proved[\s\S]*escapes its owning container[\s\S]*appending content/
    );
  });

  it('turns malformed samples into blocking receipts instead of crashing', () => {
    const result = runComparativeQualityBar({
      redFixtures: [null],
      qualificationControls: [
        null,
        ...COMPARATIVE_QUALIFICATION_CONTROLS.slice(1),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.fixtures[0]).toMatchObject({
      id: null,
      verdict: 'block',
    });
    expect(result.receipt.qualificationControls[0]).toMatchObject({
      id: null,
      verdict: 'block',
    });
    expect(result.receipt.issues.join('\n')).toMatch(
      /select-layout-shift: deliberate-red contract requires exactly one fixture/
    );
  });

  it('does not accept registry errors as deliberate-red regression proof', () => {
    const registryOnly = {
      id: redFor('atom.select').id,
      baselineId: 'unknown.baseline',
      observations: {},
    };
    const result = runComparativeQualityBar({
      redFixtures: COMPARATIVE_DELIBERATE_RED_FIXTURES.map(fixture =>
        fixture.id === registryOnly.id ? registryOnly : fixture
      ),
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /select-layout-shift: deliberate-red fixture must block with its approved regression fingerprints/
    );
  });

  it('binds every enrolled baseline to an exact deliberate-red regression', () => {
    const baselineIds = COMPARATIVE_QUALITY_BAR.map(item => item.id).sort();
    const redBaselineIds = COMPARATIVE_DELIBERATE_RED_FIXTURES.map(
      item => item.baselineId
    ).sort();
    expect(redBaselineIds).toEqual(baselineIds);

    const select = clone(redFor('atom.select'));
    select.baselineId = 'atom.button';
    select.observations = {};
    const result = runComparativeQualityBar({
      redFixtures: [select, ...COMPARATIVE_DELIBERATE_RED_FIXTURES.slice(1)],
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /select-layout-shift: deliberate-red fixture must block with its approved regression fingerprints/
    );
  });

  it('requires the exact complete finding set for every deliberate-red fixture', () => {
    for (const fixture of COMPARATIVE_DELIBERATE_RED_FIXTURES) {
      const contract = DELIBERATE_RED_CONTRACTS.find(
        item => item.fixtureId === fixture.id
      );
      expect(
        evaluateComparativeSample(fixture).findings.map(
          ({ dimension, code }) => ({ dimension, code })
        )
      ).toEqual(contract.fingerprints);
      expect(
        evaluateComparativeSample(fixture).findings.every(
          finding => finding.detail.length > 0
        )
      ).toBe(true);
    }

    const partlyHealedKeyboard = clone(redFor('atom.kbd'));
    partlyHealedKeyboard.observations['keyboard-discovery'].editableFieldSafe =
      true;
    const partlyHealedTypeset = clone(redFor('typography.system-b'));
    partlyHealedTypeset.observations['typography-rhythm'].flowDirection =
      'block-start';
    for (const partlyHealed of [partlyHealedKeyboard, partlyHealedTypeset]) {
      const result = runComparativeQualityBar({
        redFixtures: COMPARATIVE_DELIBERATE_RED_FIXTURES.map(fixture =>
          fixture.id === partlyHealed.id ? partlyHealed : fixture
        ),
      });
      expect(result.ok).toBe(false);
      expect(result.receipt.issues.join('\n')).toContain(
        `${partlyHealed.id}: deliberate-red fixture must block with its approved regression fingerprints`
      );
    }
  });

  it('blocks malformed collection observations without throwing', () => {
    for (const [baselineId, dimension, field] of [
      ['atom.select', 'semantic-anatomy', 'roles'],
      ['atom.select', 'semantic-anatomy', 'signals'],
      ['atom.select', 'state-completeness', 'states'],
      ['atom.select', 'keyboard-discovery', 'keys'],
      ['atom.kbd', 'keyboard-discovery', 'discovery'],
      ['atom.button', 'action-hierarchy', 'actionLevels'],
    ]) {
      const control = clone(controlFor(baselineId));
      control.observations[dimension][field] = 42;
      expect(evaluateComparativeSample(control).ok).toBe(false);
    }
  });

  it('rejects malformed caller options instead of falling back to green defaults', () => {
    const result = runComparativeQualityBar({
      redFixtures: null,
      qualificationControls: {},
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /supplied deliberate-red fixtures must be an array[\s\S]*supplied qualification controls must be an array/
    );
    expect(result.receipt.fixtures).toEqual([]);
    expect(result.receipt.qualificationControls).toEqual([]);
  });

  it('validates the requirement fields for each enrolled dimension', () => {
    const typography = clone(
      COMPARATIVE_QUALITY_BAR.find(item => item.id === 'typography.system-b')
    );
    delete typography.requirements.maxMeasureCh;
    expect(
      validateDimensionRequirements(typography, 'typography-rhythm')
    ).toContain(
      'typography.system-b: typography-rhythm requires a positive maxMeasureCh'
    );
  });
});
