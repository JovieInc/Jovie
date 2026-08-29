/**
 * Approved comparative rubric data for JOV-5438.
 *
 * Public references are outcome/concept inputs only. Jovie does not import
 * third-party component source, CSS, fonts, or assets through this registry.
 */

export const COMPARATIVE_QUALITY_BAR_SCHEMA =
  'jovie.component-comparative-quality-bar/v1';

const deepFreeze = value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};

export const QUALITY_BAR_CONTEXTS = deepFreeze([
  'artist-profiles',
  'smart-links',
  'embedded-mobile',
]);

export const QUALITY_BAR_DIMENSIONS = deepFreeze([
  'semantic-anatomy',
  'state-completeness',
  'keyboard-discovery',
  'action-hierarchy',
  'layout-stability',
  'responsive-fit',
  'copy-density',
  'typography-rhythm',
  'content-overflow',
  'append-stability',
]);

export const QUALITY_BAR_REFERENCES = deepFreeze({
  'shadcn-components': {
    title: 'shadcn/ui components',
    url: 'https://ui.shadcn.com/docs/components',
    accessedOn: '2026-08-29',
    license: {
      spdx: 'MIT',
      url: 'https://github.com/shadcn-ui/ui/blob/main/LICENSE.md',
    },
    useBoundary: 'outcome-reference-only',
    sourceImported: false,
  },
  'shadcn-typeset': {
    title: 'shadcn/ui Typeset',
    url: 'https://ui.shadcn.com/docs/typeset',
    accessedOn: '2026-08-29',
    license: {
      spdx: 'MIT',
      url: 'https://github.com/shadcn-ui/ui/blob/main/LICENSE.md',
    },
    useBoundary: 'concept-and-test-dimension-only',
    sourceImported: false,
  },
});

/**
 * Approved closed-world denominator. After an intentional component taxonomy
 * change, review the path-set diff and print proposed values with:
 * pnpm exec node scripts/component-comparative-quality-bar.mjs --print-inventory-ratchet
 */
export const ATOM_MOLECULE_INVENTORY_RATCHET = deepFreeze([
  {
    root: 'packages/ui/atoms',
    total: 38,
    sourceSetSha256:
      '32988c7d0cbae0ef4769209b59723357b700e4b83b85d63de32b3acb179025dc',
  },
  {
    root: 'apps/web/components/**/atoms',
    total: 137,
    sourceSetSha256:
      '7295217483d3a77597b1c05fe390b71072028389cd6ec9e944c90e5d1e608f53',
  },
  {
    root: 'apps/web/components/**/molecules',
    total: 169,
    sourceSetSha256:
      '07391e41039454eb1856bf2205b787aa6bae55fd476189f1d76f5646f13d63bf',
  },
  {
    root: 'registered-out-of-taxonomy/atoms',
    total: 0,
    sourceSetSha256:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    root: 'registered-out-of-taxonomy/molecules',
    total: 1,
    sourceSetSha256:
      '3b01bf56e00bf47a3fae15d5c7b532cf1be725362195fe6f7a00eb868bb21d31',
  },
]);

const contexts = QUALITY_BAR_CONTEXTS;
const entry = value => deepFreeze({ contexts, enrolled: true, ...value });

export const COMPARATIVE_QUALITY_BAR = deepFreeze([
  entry({
    id: 'atom.select',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/select.tsx',
      exportName: 'Select',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/select',
    nearestPattern: 'Select',
    disposition: 'improve',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'keyboard-discovery',
      'layout-stability',
      'responsive-fit',
    ],
    requirements: {
      roles: ['combobox', 'listbox', 'option'],
      states: [
        'default',
        'open',
        'selected',
        'focus-visible',
        'disabled',
        'invalid',
      ],
      signals: ['aria-expanded', 'aria-invalid'],
      keys: ['Enter', 'Space', 'ArrowDown', 'Escape'],
      stableControlBox: true,
      maxUnrelatedShiftPx: 0,
      minHitTargetPx: 44,
    },
  }),
  entry({
    id: 'atom.kbd',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/kbd.tsx',
      exportName: 'Kbd',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/kbd',
    nearestPattern: 'Kbd',
    disposition: 'keep',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'keyboard-discovery',
      'copy-density',
      'responsive-fit',
    ],
    requirements: {
      roles: ['presentation'],
      states: ['default'],
      discovery: ['tooltip', 'help-sheet'],
      collisionFree: true,
      editableFieldSafe: true,
      visibleFallback: true,
      platformLabels: true,
      maxVisibleWords: 8,
      minHitTargetPx: 44,
    },
  }),
  entry({
    id: 'atom.button',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/button.tsx',
      exportName: 'Button',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/button',
    nearestPattern: 'Button',
    disposition: 'diverge',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'keyboard-discovery',
      'action-hierarchy',
      'layout-stability',
      'responsive-fit',
    ],
    requirements: {
      roles: ['button'],
      states: ['default', 'hover', 'focus-visible', 'disabled', 'loading'],
      keys: ['Enter', 'Space'],
      actionLevels: ['primary', 'secondary', 'outline-reference'],
      maxPrimaryPerRegion: 1,
      stableControlBox: true,
      maxUnrelatedShiftPx: 0,
      minHitTargetPx: 44,
    },
  }),
  entry({
    id: 'atom.switch',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/switch.tsx',
      exportName: 'Switch',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/switch',
    nearestPattern: 'Switch / Toggle',
    disposition: 'keep',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'keyboard-discovery',
      'layout-stability',
      'responsive-fit',
    ],
    requirements: {
      roles: ['switch'],
      states: ['unchecked', 'checked', 'focus-visible', 'disabled', 'invalid'],
      signals: ['aria-checked', 'aria-invalid'],
      keys: ['Space'],
      stableControlBox: true,
      maxUnrelatedShiftPx: 0,
      minHitTargetPx: 44,
    },
  }),
  entry({
    id: 'molecule.sidebar-nav-item',
    layer: 'molecule',
    owner: {
      sourcePath: 'apps/web/components/shell/SidebarNavItem.tsx',
      exportName: 'SidebarNavItem',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/sidebar',
    nearestPattern: 'Sidebar / compact navigation',
    disposition: 'diverge',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'keyboard-discovery',
      'layout-stability',
      'responsive-fit',
      'copy-density',
    ],
    requirements: {
      roles: ['navigation', 'link'],
      states: ['default', 'hover', 'focus-visible', 'current', 'disabled'],
      signals: ['aria-current'],
      keys: ['Enter'],
      visibleFallback: true,
      stableControlBox: true,
      maxUnrelatedShiftPx: 0,
      minHitTargetPx: 44,
      maxVisibleWords: 4,
    },
  }),
  entry({
    id: 'atom.card',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/card.tsx',
      exportName: 'Card',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/card',
    nearestPattern: 'Card',
    disposition: 'keep',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'layout-stability',
      'responsive-fit',
      'copy-density',
      'content-overflow',
    ],
    requirements: {
      roles: ['heading', 'region'],
      states: ['default', 'hover', 'focus-visible', 'partial', 'offline'],
      stableControlBox: true,
      maxUnrelatedShiftPx: 0,
      minHitTargetPx: 44,
      maxVisibleWords: 48,
    },
  }),
  entry({
    id: 'atom.field',
    layer: 'atom',
    owner: {
      sourcePath: 'packages/ui/atoms/field.tsx',
      exportName: 'Field',
    },
    referenceId: 'shadcn-components',
    referenceUrl: 'https://ui.shadcn.com/docs/components/base/field',
    nearestPattern: 'Field',
    disposition: 'keep',
    requiredDimensions: [
      'semantic-anatomy',
      'state-completeness',
      'responsive-fit',
      'copy-density',
      'content-overflow',
    ],
    requirements: {
      roles: ['group', 'label', 'textbox', 'alert'],
      states: ['default', 'focus-visible', 'disabled', 'invalid', 'error'],
      signals: ['aria-invalid', 'aria-describedby'],
      minHitTargetPx: 44,
      maxVisibleWords: 24,
    },
  }),
  entry({
    id: 'typography.system-b',
    layer: 'system',
    owner: {
      sourcePath: 'DESIGN.md',
      exportName: 'Typography',
    },
    referenceId: 'shadcn-typeset',
    referenceUrl: 'https://ui.shadcn.com/docs/typeset',
    nearestPattern: 'Typeset rhythm and stability concepts',
    disposition: 'diverge',
    requiredDimensions: [
      'typography-rhythm',
      'responsive-fit',
      'copy-density',
      'content-overflow',
      'append-stability',
    ],
    requirements: {
      minMobileBodyPx: 15,
      minLineHeight: 1.5,
      maxMeasureCh: 80,
      flowDirection: 'block-start',
      maxVisibleWords: 120,
    },
  }),
]);
