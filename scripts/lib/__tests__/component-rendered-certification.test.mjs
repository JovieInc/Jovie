import { describe, expect, it } from 'vitest';
import {
  APPLICABLE_INVARIANTS,
  DELIBERATE_RED_FIXTURES,
  evaluateRenderedSample,
  LANDING_BATCH_SAMPLES,
  RENDERED_CERT_SCHEMA,
  runRenderedCertification,
} from '../../component-rendered-certification.mjs';
import { runComponentShipGate } from '../../component-ship-gate.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone = value => structuredClone(value);
const details = result => result.findings.map(item => item.detail).join('\n');

describe('rendered component certification', () => {
  it('keeps the applicable invariant contract explicit and fail-closed', () => {
    expect(APPLICABLE_INVARIANTS).toEqual([
      'design',
      'copy',
      'accessibility',
      'interaction',
      'layout-stability',
      'theme',
      'semantic-variant',
      'tokenized-padding',
      'concentric-radius',
    ]);
    const sample = clone(LANDING_BATCH_SAMPLES[0]);
    sample.notApplicable = sample.notApplicable.filter(
      item => item.invariant !== 'interaction'
    );
    const omitted = evaluateRenderedSample(sample);
    expect(omitted.ok).toBe(false);
    expect(details(omitted)).toMatch(/neither applicable/);
  });

  it('is source-blind and blocks the deliberate-red StatusBadge fixtures', () => {
    const theme = clone(DELIBERATE_RED_FIXTURES[0]);
    const withoutSource = evaluateRenderedSample(theme);
    theme.source =
      'export function StatusBadge() { return <span>Active</span> }';
    expect(evaluateRenderedSample(theme).findings).toEqual(
      withoutSource.findings
    );
    expect(details(withoutSource)).toMatch(/light treatment on dark surface/);
    expect(details(evaluateRenderedSample(DELIBERATE_RED_FIXTURES[1]))).toMatch(
      /arbitrary color-name variant "red"[\s\S]*unrelated tone[\s\S]*split owner/
    );
    expect(details(evaluateRenderedSample(DELIBERATE_RED_FIXTURES[2]))).toMatch(
      /arbitrary padding[\s\S]*outer 16px !== inner 16px \+ inset 4px/
    );
  });

  it('emits exact-head pass/block receipts for the landing batch', () => {
    const result = runRenderedCertification({ headSha: HEAD });
    expect(result.ok).toBe(true);
    expect(result.receipt).toMatchObject({
      schema: RENDERED_CERT_SCHEMA,
      headSha: HEAD,
      fixtures: [
        { verdict: 'block' },
        { verdict: 'block' },
        { verdict: 'block' },
      ],
      shadcnOutcome: {
        ok: true,
        comparativeQualityBar: {
          ok: true,
          claimBoundary: 'rubric-and-evaluator-qualification-only',
          inventory: {
            total: expect.any(Number),
            pendingComparison: expect.any(Number),
          },
        },
      },
    });
    expect(
      result.receipt.landingBatch.map(item => [item.id, item.verdict])
    ).toEqual([
      ['landing-batch.atom.badge.default', 'pass'],
      ['landing-batch.atom.badge.tone-success', 'pass'],
      ['landing-batch.atom.button.primary', 'pass'],
      ['landing-batch.atom.card.default', 'pass'],
    ]);
  });

  it('fails closed on landing-batch regressions and green deliberate-red fixtures', () => {
    const dirty = clone(LANDING_BATCH_SAMPLES);
    dirty[0].nodes[0].fill.luminance = 'light';
    const blocked = runRenderedCertification({
      headSha: HEAD,
      landingBatch: dirty,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.receipt.landingBatch[0].verdict).toBe('block');
    const green = clone(DELIBERATE_RED_FIXTURES[0]);
    green.nodes[0].fill.luminance = 'dark';
    green.nodes[0].foreground.luminance = 'light';
    const leaked = runRenderedCertification({
      headSha: HEAD,
      redFixtures: [green],
    });
    expect(leaked.ok).toBe(false);
    expect(leaked.receipt.issues.join('\n')).toMatch(
      /deliberate-red fixture must block/
    );
  });

  it('extends component-ship-gate instead of adding a parallel path', () => {
    const report = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      skipLiveStorybook: true,
      headSha: HEAD,
    });
    expect(report.ok).toBe(true);
    expect(report.sections.renderedCertification.receipt).toMatchObject({
      gate: 'component-ship-gate',
      headSha: HEAD,
      shadcnOutcome: {
        ok: true,
        section: 'shadcnOutcome',
        comparativeQualityBar: {
          schema: 'jovie.component-comparative-quality-bar/v1',
          ok: true,
        },
      },
    });
  });

  it('propagates comparative failures through rendered certification and the native gate', () => {
    const rendered = runRenderedCertification({
      headSha: HEAD,
      comparativeQualificationControls: [],
    });
    expect(rendered.ok).toBe(false);
    expect(rendered.receipt.issues.join('\n')).toMatch(
      /comparative quality bar: atom\.select: enrolled baseline requires exactly one qualification control/
    );

    const gate = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      skipLiveStorybook: true,
      headSha: HEAD,
      comparativeQualificationControls: [],
    });
    expect(gate.ok).toBe(false);
    expect(gate.sections.renderedCertification.ok).toBe(false);
  });
});
