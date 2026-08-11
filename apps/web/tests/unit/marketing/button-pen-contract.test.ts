import fs from 'node:fs';
import {
  BUTTON_PEN_CONTRACT,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
  buttonPenVariantKey,
  resolveButtonPenMaster,
} from '@jovie/ui';
import { describe, expect, it } from 'vitest';

/**
 * Cross-boundary Button Pen contract check.
 *
 * The source-side gates always run. When PEN_BUTTON_READBACK_EVIDENCE points
 * at a JSON artifact produced by reading the canonical active Pen file through
 * the supported Pen CLI, the cross-boundary gate additionally proves every
 * source-declared master root and descendant slot exists in that file and
 * fails closed when source points to a missing Pen node.
 *
 * Evidence shape:
 *   { "path": "/abs/canonical.pen", "recordedAt": "<iso>", "nodeIds": ["g3IC1"] }
 *
 * Pen-lane invocation (run where the Pen CLI and canonical file live):
 *   PEN_BUTTON_READBACK_EVIDENCE=/path/to/readback.json \
 *     pnpm --filter web exec vitest run tests/unit/marketing/button-pen-contract.test.ts
 */

const VARIANT_KEY_PATTERN = /^button\/([^/]+)\/([^/]+)\/(idle|destructive)$/;

const familyEntries = Object.entries(
  BUTTON_PEN_CONTRACT.rootByVariantKey
) as readonly [
  string,
  NonNullable<
    (typeof BUTTON_PEN_CONTRACT.rootByVariantKey)[keyof typeof BUTTON_PEN_CONTRACT.rootByVariantKey]
  >,
][];

interface PenReadbackEvidence {
  readonly path?: unknown;
  readonly recordedAt?: unknown;
  readonly nodeIds?: unknown;
}

function loadReadbackEvidence(evidencePath: string): {
  path: string;
  recordedAt: string;
  nodeIds: ReadonlySet<string>;
} {
  if (evidencePath.toLowerCase().endsWith('.pen')) {
    throw new Error(
      'Readback evidence must be a JSON artifact, never the .pen document itself'
    );
  }
  const parsed = JSON.parse(
    fs.readFileSync(evidencePath, 'utf8')
  ) as PenReadbackEvidence;
  if (typeof parsed.path !== 'string' || !parsed.path.endsWith('.pen')) {
    throw new Error('Readback evidence must name the canonical .pen path');
  }
  if (
    typeof parsed.recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.recordedAt))
  ) {
    throw new Error('Readback evidence must carry a parseable recordedAt');
  }
  if (
    !Array.isArray(parsed.nodeIds) ||
    parsed.nodeIds.some(id => typeof id !== 'string' || !id)
  ) {
    throw new Error('Readback evidence must list string nodeIds');
  }
  return {
    path: parsed.path,
    recordedAt: parsed.recordedAt,
    nodeIds: new Set(parsed.nodeIds as string[]),
  };
}

describe('canonical Button Pen family contract', () => {
  it('declares only well-formed normalized keys with unique roots and slots', () => {
    expect(familyEntries.length).toBeGreaterThan(0);

    const roots = new Set<string>();
    for (const [key, master] of familyEntries) {
      const match = VARIANT_KEY_PATTERN.exec(key);
      expect(match, key).not.toBeNull();
      const [, variant, size] = match as RegExpExecArray;
      expect(BUTTON_VARIANT_NAMES, key).toContain(variant);
      expect(BUTTON_SIZE_NAMES, key).toContain(size);
      expect(
        key,
        'declared key must equal the deterministic key function output'
      ).toBe(
        buttonPenVariantKey({
          variant: variant as (typeof BUTTON_VARIANT_NAMES)[number],
          size: size as (typeof BUTTON_SIZE_NAMES)[number],
          destructive: match?.[3] === 'destructive',
        })
      );

      expect(
        roots.has(master.rootId),
        `duplicate master ${master.rootId}`
      ).toBe(false);
      roots.add(master.rootId);

      const slots = [
        master.descendants.label,
        master.descendants.leadingIcon,
      ].filter(Boolean);
      expect(new Set(slots).size, key).toBe(slots.length);
      expect(slots, key).not.toContain(master.rootId);
    }
  });

  it('resolves declared selections to their exact master and nothing else', () => {
    for (const [key, master] of familyEntries) {
      const [, variant, size, state] = VARIANT_KEY_PATTERN.exec(
        key
      ) as RegExpExecArray;
      expect(
        resolveButtonPenMaster({
          variant: variant as (typeof BUTTON_VARIANT_NAMES)[number],
          size: size as (typeof BUTTON_SIZE_NAMES)[number],
          destructive: state === 'destructive',
        })
      ).toEqual(master);
    }

    // Fail closed: unmapped selections never fall back to the primary master.
    expect(
      resolveButtonPenMaster({ variant: 'primary', size: 'md' })
    ).toBeNull();
    expect(resolveButtonPenMaster({ variant: 'ghost', size: 'lg' })).toBeNull();
    expect(
      resolveButtonPenMaster({
        variant: 'primary',
        size: 'lg',
        destructive: true,
      })
    ).toBeNull();
  });

  it('proves every declared root and descendant exists in the Pen readback', () => {
    const evidencePath = process.env.PEN_BUTTON_READBACK_EVIDENCE;
    if (!evidencePath) {
      // Cross-boundary gate is armed but only executes where the supported
      // Pen CLI can read the canonical active file (local Pen lane).
      return;
    }

    const evidence = loadReadbackEvidence(evidencePath);
    const missing: string[] = [];
    for (const [key, master] of familyEntries) {
      if (!evidence.nodeIds.has(master.rootId)) {
        missing.push(`${key} root ${master.rootId}`);
      }
      if (!evidence.nodeIds.has(master.descendants.label)) {
        missing.push(`${key} label ${master.descendants.label}`);
      }
      if (
        master.descendants.leadingIcon &&
        !evidence.nodeIds.has(master.descendants.leadingIcon)
      ) {
        missing.push(`${key} leadingIcon ${master.descendants.leadingIcon}`);
      }
    }

    expect(
      missing,
      `source-declared Pen nodes missing from ${evidence.path} (recorded ${evidence.recordedAt})`
    ).toEqual([]);
  });
});
