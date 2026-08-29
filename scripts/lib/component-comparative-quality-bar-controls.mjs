/** Source-blind evaluator controls and deliberate regressions for JOV-5438. */

const box = { x: 12, y: 8, width: 180, height: 32 };
const semantic = (roles, signals = []) => ({
  roles,
  signals,
  accessibleNames: true,
});
const states = value => ({
  states: value,
  visibleFocus: true,
  nonColorStateCue: true,
  reducedMotionSafe: true,
});
const layout = () => ({ before: box, after: box, unrelatedShiftPx: 0 });
const responsive = (minHitTargetPx = 44) => ({
  viewportWidth: 390,
  documentScrollWidth: 390,
  minHitTargetPx,
});
const copy = visibleWords => ({ visibleWords, repeatedMessages: 0 });
const overflow = () => ({
  containerWidth: 390,
  contentScrollWidth: 390,
  documentOverflowPx: 0,
  wideBlocksContained: true,
});
const deepFreeze = value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};
const sample = (id, baselineId, observations) =>
  deepFreeze({ id, baselineId, observations });

// biome-ignore format: compact source-blind evaluator controls
export const COMPARATIVE_QUALIFICATION_CONTROLS = Object.freeze([
  sample('qualification-control.atom.select', 'atom.select', {
    'semantic-anatomy': semantic(['combobox', 'listbox', 'option'], ['aria-expanded', 'aria-invalid']),
    'state-completeness': states(['default', 'open', 'selected', 'focus-visible', 'disabled', 'invalid']),
    'keyboard-discovery': { keys: ['Enter', 'Space', 'ArrowDown', 'Escape'] },
    'layout-stability': layout(),
    'responsive-fit': responsive(),
  }),
  sample('qualification-control.atom.kbd', 'atom.kbd', {
    'semantic-anatomy': semantic(['presentation']),
    'state-completeness': states(['default']),
    'keyboard-discovery': { discovery: ['tooltip', 'help-sheet'], collisionFree: true, editableFieldSafe: true, visibleFallback: true, platformLabels: true },
    'copy-density': copy(4),
    'responsive-fit': responsive(),
  }),
  sample('qualification-control.atom.button', 'atom.button', {
    'semantic-anatomy': semantic(['button']),
    'state-completeness': states(['default', 'hover', 'focus-visible', 'disabled', 'loading']),
    'keyboard-discovery': { keys: ['Enter', 'Space'] },
    'action-hierarchy': { actionLevels: ['primary', 'secondary', 'outline-reference'], distinguishable: true, primaryCount: 1 },
    'layout-stability': layout(),
    'responsive-fit': responsive(),
  }),
  sample('qualification-control.atom.switch', 'atom.switch', {
    'semantic-anatomy': semantic(['switch'], ['aria-checked', 'aria-invalid']),
    'state-completeness': states(['unchecked', 'checked', 'focus-visible', 'disabled', 'invalid']),
    'keyboard-discovery': { keys: ['Space'] },
    'layout-stability': layout(),
    'responsive-fit': responsive(),
  }),
  sample('qualification-control.molecule.sidebar-nav-item', 'molecule.sidebar-nav-item', {
    'semantic-anatomy': semantic(['navigation', 'link'], ['aria-current']),
    'state-completeness': states(['default', 'hover', 'focus-visible', 'current', 'disabled']),
    'keyboard-discovery': { keys: ['Enter'], visibleFallback: true },
    'layout-stability': layout(),
    'responsive-fit': responsive(),
    'copy-density': copy(2),
  }),
  sample('qualification-control.atom.card', 'atom.card', {
    'semantic-anatomy': semantic(['heading', 'region']),
    'state-completeness': states(['default', 'hover', 'focus-visible', 'partial', 'offline']),
    'layout-stability': layout(),
    'responsive-fit': responsive(),
    'copy-density': copy(20),
    'content-overflow': overflow(),
  }),
  sample('qualification-control.atom.field', 'atom.field', {
    'semantic-anatomy': semantic(['group', 'label', 'textbox', 'alert'], ['aria-invalid', 'aria-describedby']),
    'state-completeness': states(['default', 'focus-visible', 'disabled', 'invalid', 'error']),
    'responsive-fit': responsive(),
    'copy-density': copy(12),
    'content-overflow': overflow(),
  }),
  sample('qualification-control.typography.system-b', 'typography.system-b', {
    'typography-rhythm': { headingLevels: [1, 2, 3], mobileBodyPx: 15, lineHeight: 1.6, measureCh: 72, flowDirection: 'block-start' },
    'responsive-fit': responsive(0),
    'copy-density': copy(90),
    'content-overflow': overflow(),
    'append-stability': { beforeStyleHash: 'jovie-type-v1', afterStyleHash: 'jovie-type-v1', priorBlockGeometryDeltaPx: 0 },
  }),
]);

const CONTROL_BY_BASELINE = new Map(
  COMPARATIVE_QUALIFICATION_CONTROLS.map(control => [
    control.baselineId,
    control,
  ])
);
const observationsFor = baselineId => {
  const control = CONTROL_BY_BASELINE.get(baselineId);
  if (!control) {
    throw new Error(
      `Missing comparative qualification control for baseline: ${baselineId}`
    );
  }
  return control.observations;
};

// biome-ignore format: each fixture is an intentionally obvious real regression.
export const COMPARATIVE_DELIBERATE_RED_FIXTURES = Object.freeze([
  sample('deliberate-red.quality-bar.select-layout-shift', 'atom.select', {
    ...observationsFor('atom.select'),
    'layout-stability': { before: box, after: { ...box, y: 16, height: 36 }, unrelatedShiftPx: 12 },
  }),
  sample('deliberate-red.quality-bar.keyboard-shortcut-discovery', 'atom.kbd', {
    ...observationsFor('atom.kbd'),
    'keyboard-discovery': { discovery: ['tooltip'], collisionFree: false, editableFieldSafe: false, visibleFallback: false, platformLabels: false },
  }),
  sample('deliberate-red.quality-bar.button-primary-overload', 'atom.button', {
    ...observationsFor('atom.button'),
    'action-hierarchy': { actionLevels: ['primary', 'secondary', 'outline-reference'], distinguishable: true, primaryCount: 2 },
  }),
  sample('deliberate-red.quality-bar.switch-state-keyboard-gap', 'atom.switch', {
    ...observationsFor('atom.switch'),
    'state-completeness': states(['unchecked', 'checked', 'focus-visible', 'disabled']),
    'keyboard-discovery': { keys: [] },
  }),
  sample('deliberate-red.quality-bar.compact-navigation-semantics', 'molecule.sidebar-nav-item', {
    ...observationsFor('molecule.sidebar-nav-item'),
    'semantic-anatomy': semantic(['link']),
  }),
  sample('deliberate-red.quality-bar.card-bento-mobile-overflow', 'atom.card', {
    ...observationsFor('atom.card'),
    'responsive-fit': { viewportWidth: 390, documentScrollWidth: 438, minHitTargetPx: 44 },
    'copy-density': copy(80),
    'content-overflow': { containerWidth: 390, contentScrollWidth: 438, documentOverflowPx: 48, wideBlocksContained: false },
  }),
  sample('deliberate-red.quality-bar.form-field-semantics', 'atom.field', {
    ...observationsFor('atom.field'),
    'semantic-anatomy': semantic(['group', 'label', 'textbox']),
  }),
  sample('deliberate-red.quality-bar.typeset-rhythm-overflow', 'typography.system-b', {
    ...observationsFor('typography.system-b'),
    'typography-rhythm': { headingLevels: [1, 3], mobileBodyPx: 13, lineHeight: 1.35, measureCh: 96, flowDirection: 'bidirectional' },
    'content-overflow': { containerWidth: 390, contentScrollWidth: 438, documentOverflowPx: 48, wideBlocksContained: false },
    'append-stability': { beforeStyleHash: 'before', afterStyleHash: 'after', priorBlockGeometryDeltaPx: 8 },
  }),
]);

export const DELIBERATE_RED_CONTRACTS = deepFreeze([
  {
    fixtureId: 'deliberate-red.quality-bar.select-layout-shift',
    baselineId: 'atom.select',
    fingerprints: [
      { dimension: 'layout-stability', code: 'control-box-changed' },
      { dimension: 'layout-stability', code: 'unrelated-content-shifted' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.keyboard-shortcut-discovery',
    baselineId: 'atom.kbd',
    fingerprints: [
      { dimension: 'keyboard-discovery', code: 'discovery-missing' },
      { dimension: 'keyboard-discovery', code: 'collisionFree-required' },
      { dimension: 'keyboard-discovery', code: 'editableFieldSafe-required' },
      { dimension: 'keyboard-discovery', code: 'visibleFallback-required' },
      { dimension: 'keyboard-discovery', code: 'platformLabels-required' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.button-primary-overload',
    baselineId: 'atom.button',
    fingerprints: [{ dimension: 'action-hierarchy', code: 'primary-overload' }],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.switch-state-keyboard-gap',
    baselineId: 'atom.switch',
    fingerprints: [
      { dimension: 'state-completeness', code: 'states-missing' },
      { dimension: 'keyboard-discovery', code: 'keys-missing' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.compact-navigation-semantics',
    baselineId: 'molecule.sidebar-nav-item',
    fingerprints: [
      { dimension: 'semantic-anatomy', code: 'roles-missing' },
      { dimension: 'semantic-anatomy', code: 'signals-missing' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.card-bento-mobile-overflow',
    baselineId: 'atom.card',
    fingerprints: [
      { dimension: 'responsive-fit', code: 'horizontal-overflow' },
      { dimension: 'copy-density', code: 'copy-density-exceeded' },
      { dimension: 'content-overflow', code: 'content-overflow' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.form-field-semantics',
    baselineId: 'atom.field',
    fingerprints: [
      { dimension: 'semantic-anatomy', code: 'roles-missing' },
      { dimension: 'semantic-anatomy', code: 'signals-missing' },
    ],
  },
  {
    fixtureId: 'deliberate-red.quality-bar.typeset-rhythm-overflow',
    baselineId: 'typography.system-b',
    fingerprints: [
      { dimension: 'typography-rhythm', code: 'heading-rhythm-invalid' },
      { dimension: 'typography-rhythm', code: 'mobile-body-small' },
      { dimension: 'typography-rhythm', code: 'line-height-small' },
      { dimension: 'typography-rhythm', code: 'measure-wide' },
      { dimension: 'typography-rhythm', code: 'flow-direction-invalid' },
      { dimension: 'content-overflow', code: 'content-overflow' },
      { dimension: 'append-stability', code: 'append-restyled-or-moved' },
    ],
  },
]);
