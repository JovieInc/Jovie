import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  compileDetectionCoverageRegistry,
  getDetectionCoverageSnapshot,
} from '@/lib/hud/detection-coverage';
import { HudDetectionCoveragePanel } from './HudDetectionCoveragePanel';

describe('HudDetectionCoveragePanel', () => {
  it('exposes coverage, trends, blind spots, rescues, and the next capability', () => {
    const snapshot = getDetectionCoverageSnapshot();
    render(<HudDetectionCoveragePanel snapshot={snapshot} />);
    expect(
      screen.getByTestId('hud-detection-coverage-panel')
    ).toBeInTheDocument();
    expect(screen.getByText('Detector Coverage')).toBeInTheDocument();
    expect(screen.getByText('Founder Rescue Rate')).toBeInTheDocument();
    expect(screen.getByText('Median Failure → Detection')).toBeInTheDocument();
    expect(screen.getByText('Recent Blind Spots')).toBeInTheDocument();
    expect(screen.getByText('Recent Founder Rescues')).toBeInTheDocument();
    expect(screen.getByText('JOV-7207')).toBeInTheDocument();
    expect(
      screen.getAllByText(snapshot.nextCapability?.title ?? '').length
    ).toBeGreaterThan(0);
    expect(snapshot.total).toBe(4);
    expect(snapshot.covered).toBeGreaterThan(0);
    expect(snapshot.covered).toBeLessThan(snapshot.total);
    expect(snapshot.founderRescueTrend).toBe('down');
    expect(snapshot.medianDetectionTrend).toBe('down');
  });
  it('ranks unlearned capabilities and rejects false learned state', () => {
    const capability = (id: string, status: string, score: number) => ({
      id,
      title: id,
      status,
      knownBlindSpots: [`${id} blind spot`],
      nextExpansion: `expand ${id}`,
      proof: {
        deliberateRedFixtures: status === 'live-verified' ? ['red'] : [],
        controlCases: status === 'live-verified' ? ['control'] : [],
        lastVerifiedLiveFiring:
          status === 'live-verified'
            ? {
                evidenceRef: 'live',
                kind: 'injection',
                verifiedAt: '2026-10-14T00:00:00.000Z',
              }
            : null,
      },
      priority: { score },
    });
    const base = {
      schema: 'jovie.detection-coverage-registry/v1',
      metricWindows: [],
      recentFounderRescues: [],
    };
    const snapshot = compileDetectionCoverageRegistry({
      ...base,
      capabilities: [
        capability('a-live', 'live-verified', 1),
        capability('b-lower', 'planned', 4),
        capability('c-higher', 'planned', 9),
      ],
    });
    expect(snapshot.nextCapability?.id).toBe('c-higher');
    expect(() =>
      compileDetectionCoverageRegistry({
        ...base,
        capabilities: [
          {
            ...capability('a-unproven', 'live-verified', 1),
            proof: {
              deliberateRedFixtures: ['red'],
              controlCases: [],
              lastVerifiedLiveFiring: null,
            },
          },
        ],
      })
    ).toThrow(/cannot be learned/);
  });
});
