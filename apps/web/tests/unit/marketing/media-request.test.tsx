import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingMedia } from '@/components/marketing/MarketingMedia';
import {
  createMarketingMediaRecipeInput,
  MARKETING_MEDIA_PRESENTATIONS,
  MARKETING_MEDIA_RECIPE_IDS,
  resolveMarketingMediaRequest,
  validateMarketingMediaRecipeInput,
} from '@/data/marketing/mediaRecipes';
import {
  MARKETING_MEDIA_INPUTS,
  MARKETING_MEDIA_PRESENTATION_FILES,
  MARKETING_MEDIA_PRESENTATION_REVISION,
  MARKETING_MEDIA_REFERENCE_REVIEW,
  MARKETING_MEDIA_TOKEN_FILES,
  MARKETING_MEDIA_TOKEN_REVISION,
} from '@/data/marketing/mediaReferences';
import { getMarketingExportScenarios } from '@/lib/screenshots/registry';
import manifest from '../../../screenshot-catalog/current/manifest.json';

const base = createMarketingMediaRecipeInput('dark-glass');
const negatives = {
  'absent request': null,
  'unknown recipe': { ...base, recipeId: 'neon' },
  'unregistered asset': {
    ...base,
    source: {
      ...base.source,
      kind: 'generated-artwork',
      scenarioId: undefined,
      assetId: 'unreviewed',
    },
  },
  'missing revision': {
    ...base,
    source: { ...base.source, sourceRevision: undefined },
  },
  'stale revision': {
    ...base,
    source: { ...base.source, sourceRevision: 'old' },
  },
  'changed pixels': {
    ...base,
    source: { ...base.source, assetHash: '0'.repeat(64) },
  },
  'unknown accent': { ...base, accent: '#abcdef' },
  'wrong anchor': { ...base, accent: 'ultra' },
  'wrong treatment': { ...base, treatment: 'flow' },
  'missing fallback': { ...base, behavior: { motion: 'static' } },
  'wrong fallback': {
    ...base,
    behavior: { motion: 'static', fallback: 'plain-canvas' },
  },
  'unsafe focal': {
    ...base,
    layout: { ...base.layout, focal: { x: 50, y: 50 } },
  },
  'wrong safe area': {
    ...base,
    layout: { ...base.layout, safeArea: 'full-bleed-editorial' },
  },
  'unknown delivery': {
    ...base,
    delivery: { ...base.delivery, profile: 'video' },
  },
  'old tokens': {
    ...base,
    delivery: { ...base.delivery, tokenRevision: 'old' },
  },
  'approval flag': { ...base, approved: true },
  'module import': { ...base, source: { ...base.source, module: 'fs' } },
  'script injection': {
    ...base,
    behavior: { ...base.behavior, script: 'alert(1)' },
  },
  'unknown capture': {
    ...base,
    source: { ...base.source, scenarioId: 'private-admin' },
  },
  'unsupported source': {
    ...base,
    source: {
      kind: 'generated-artwork',
      assetId: 'unreviewed',
      sourceRevision: 'r1',
      assetHash: '0'.repeat(64),
    },
  },
};

function digest(files: readonly string[]) {
  const hash = createHash('sha256');
  for (const file of files)
    hash.update(readFileSync(resolve(import.meta.dirname, '../../..', file)));
  return hash.digest('hex');
}

describe('registered marketing media requests', () => {
  it('snapshots the actual serialized contract and actionable negative fixtures', () => {
    const requests = MARKETING_MEDIA_RECIPE_IDS.map(
      createMarketingMediaRecipeInput
    );
    expect(
      requests.map(resolveMarketingMediaRequest).every(result => result.ok)
    ).toBe(true);
    expect(
      JSON.stringify({
        requests,
        presentations: MARKETING_MEDIA_PRESENTATIONS,
        referenceReview: MARKETING_MEDIA_REFERENCE_REVIEW,
        inputs: MARKETING_MEDIA_INPUTS,
      })
    ).toMatchSnapshot();
    const errors = Object.fromEntries(
      Object.entries(negatives).map(([name, input]) => [
        name,
        validateMarketingMediaRecipeInput(input),
      ])
    );
    for (const findings of Object.values(errors))
      expect(findings.length).toBeGreaterThan(0);
    expect(errors).toMatchSnapshot();
  });

  it('binds source and token revisions to checked-in bytes and approved screenshot registrations', () => {
    for (const input of MARKETING_MEDIA_INPUTS) {
      expect(digest(input.files), input.id).toBe(input.hash);
      expect(input.rights).toBe('jovie-owned');
      if (input.kind === 'real-capture') {
        expect(
          getMarketingExportScenarios().some(
            scenario => scenario.id === input.id
          )
        ).toBe(true);
        expect(manifest.find(entry => entry.id === input.id)?.gitSha).toBe(
          input.revision
        );
      }
    }
    expect(MARKETING_MEDIA_TOKEN_REVISION).toContain(
      digest(MARKETING_MEDIA_TOKEN_FILES)
    );
    expect(digest(MARKETING_MEDIA_PRESENTATION_FILES)).toBe(
      MARKETING_MEDIA_PRESENTATION_REVISION
    );
  });

  it('accepts asymmetric focal points, opaque fallback and purposeful dense specs without grading captured colors', () => {
    const request = createMarketingMediaRecipeInput('flowing-accent');
    const result = resolveMarketingMediaRequest({
      ...request,
      layout: { ...request.layout, sectionId: 'spec-wall' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a supported neighbor');
    expect(
      'focal' in result.presentation.composition
        ? result.presentation.composition.focal.desktop
        : null
    ).toEqual({
      x: 78,
      y: 30,
    });
    expect(result.scene?.uiAnchor.hex).toBe('#11AFFF');
    expect(result.scene?.sceneReference.hex).toBe('#3FAFF3');
    expect(validateMarketingMediaRecipeInput(base)).toEqual([]);
    const changed = resolveMarketingMediaRequest({
      ...base,
      layout: { ...base.layout, sectionId: 'spec-wall' },
    });
    const original = resolveMarketingMediaRequest(base);
    expect(
      changed.ok && original.ok && changed.identity !== original.identity
    ).toBe(true);
  });

  it('dispatches real captures, preserves their aspect ratio through load/error, and renders registered background variants', async () => {
    const { container, rerender } = render(<MarketingMedia request={base} />);
    const frame = screen.getByTestId(
      'product-screenshot-frame-dashboard-releases-sidebar-desktop'
    );
    const aspect = frame.style.aspectRatio;
    fireEvent.load(screen.getByRole('img'));
    await waitFor(() => expect(frame).toHaveAttribute('data-status', 'loaded'));
    expect(frame.style.aspectRatio).toBe(aspect);
    fireEvent.error(screen.getByRole('img'));
    expect(frame).toHaveAttribute('data-status', 'error');
    expect(frame.style.aspectRatio).toBe(aspect);
    for (const recipeId of [
      'flowing-accent',
      'soft-editorial-background',
    ] as const) {
      rerender(
        <MarketingMedia request={createMarketingMediaRecipeInput(recipeId)} />
      );
      expect(container.querySelector('[aria-hidden="true"]')).toHaveAttribute(
        'data-variant',
        MARKETING_MEDIA_PRESENTATIONS[recipeId].treatment
      );
    }
    rerender(
      <MarketingMedia
        request={createMarketingMediaRecipeInput('compact-glass')}
      />
    );
    expect(container.querySelector('.compact-glass-module')).toBeTruthy();
  });
});
