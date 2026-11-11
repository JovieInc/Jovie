import { describe, expect, it } from 'vitest';
import { machineTextReasons } from '../lib/presentation/contracts';
import fixture from './dogfood-fixtures.json';
import {
  type DogfoodSample,
  reportDogfood,
  scanDogfood,
} from './dogfood-scanners';

const sample: DogfoodSample = {
  id: 'fixture',
  source: 'unit fixture',
  visibleText: [],
  buttons: [],
  labels: [],
  columns: [],
};
describe('warn-only dogfood counters', () => {
  it('reproduces the checked-in fixture baseline without a blocking verdict', () => {
    const report = reportDogfood(
      fixture.samples as DogfoodSample[],
      fixture.baseline
    );
    expect(report.mode).toBe('warn-only');
    expect(report.metrics.map(metric => metric.delta)).toEqual([0, 0, 0, 0, 0]);
    expect(report).not.toHaveProperty('ok');
  });

  it.each([
    '{"id":"x"}',
    'lifestyle_only',
    '12345678-1234-1234-1234-123456789abc',
    'abcdefabcdefabcdefabcdef',
    'undefined',
    'null',
    'NaN',
    'As Codex acting on behalf of a user',
    'dogfood-invariant-probe-123',
  ])('warns on machine-shaped text: %s', text =>
    expect(machineTextReasons(text).length).toBeGreaterThan(0)
  );

  it('counts one observation once and does not echo its content', () => {
    const report = reportDogfood(
      [{ ...sample, visibleText: ['{"secret_id":"private-value"}'] }],
      {
        machineText: 0,
        routeTitle: 0,
        buttonHeight: 0,
        casing: 0,
        emptyColumn: 0,
      }
    );
    expect(report.metrics[0]).toMatchObject({
      count: 1,
      delta: 1,
      status: 'regression',
    });
    expect(JSON.stringify(report)).not.toContain('private-value');
  });

  it.each(['Inbox | Jovie | Jovie', 'Jovie', 'Home | Jovie'])(
    'reports title drift: %s',
    documentTitle => {
      expect(
        scanDogfood([
          {
            ...sample,
            route: {
              navLabel: 'Inbox',
              heading: 'Inbox',
              documentTitle,
              brand: 'Jovie',
            },
          },
        ]).counts.routeTitle
      ).toBe(1);
    }
  );

  it('accepts one suffix and matching nav/heading for either brand', () => {
    for (const brand of ['Jovie', 'Ovie'])
      expect(
        scanDogfood([
          {
            ...sample,
            route: {
              navLabel: 'Inbox',
              heading: 'Inbox',
              documentTitle: `Inbox | ${brand}`,
              brand,
            },
          },
        ]).counts.routeTitle
      ).toBe(0);
  });

  it('includes the half-pixel boundary and skips icon-only buttons', () => {
    const heights = [27.5, 28.5, 31.5, 32.5, 27.49, 32.51, NaN];
    expect(
      scanDogfood([
        {
          ...sample,
          buttons: [
            ...heights.map(height => ({ height, text: 'Add' })),
            { height: 20, text: '' },
          ],
        },
      ]).counts.buttonHeight
    ).toBe(3);
  });

  it('counts over 90% empty populated columns, preserving zero as real data', () => {
    const columns = [
      { name: '90%', cells: [...Array(9).fill(null), 0] },
      { name: 'all', cells: [null, undefined, ' ', '—', '–', '-'] },
      { name: 'zero', cells: [0, '0'] },
      { name: 'unpopulated', cells: [] },
    ];
    expect(scanDogfood([{ ...sample, columns }]).counts.emptyColumn).toBe(1);
  });
});
