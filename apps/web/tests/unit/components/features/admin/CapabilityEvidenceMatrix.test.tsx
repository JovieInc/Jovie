import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CapabilityEvidenceRecord } from '@/lib/admin/capability-evidence';

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
    ...rest
  }: { readonly children: ReactNode } & Record<string, unknown>) => (
    <section {...rest}>{children}</section>
  ),
}));
vi.mock('@/components/molecules/ContentMetricRow', () => ({
  ContentMetricRow: ({
    label,
    value,
  }: {
    readonly label: ReactNode;
    readonly value: ReactNode;
  }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));

const record = (
  overrides: Partial<CapabilityEvidenceRecord> = {}
): CapabilityEvidenceRecord => ({
  capabilityId: 'public-profile-pages',
  subjectId: 'feature.profile.public-profile-pages',
  title: 'Public profile pages',
  goldenPath: 'Fan opens a public artist profile and taps a link.',
  certification: {
    state: 'review_ready',
    readiness: 'ready',
    decisionEvidenceDigest: 'a'.repeat(40),
    sourcePath: 'docs/FEATURE_REGISTRY.md',
  },
  deployment: {
    commitSha: 'b'.repeat(40),
    version: '1.2.3',
    environment: 'production',
    deploymentId: 'dpl_1',
  },
  rollout: { gate: null, configuredPercent: null },
  clientSha: null,
  exposure: {
    measured: true,
    count: 128,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'customers',
    error: null,
  },
  outcome: {
    measured: true,
    count: 41,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'customers',
    error: null,
  },
  generatedAt: '2026-10-02T00:00:00.000Z',
  ...overrides,
});

describe('CapabilityEvidenceMatrix', () => {
  it('renders the joined evidence and never claims a client build', async () => {
    const { CapabilityEvidenceMatrix } = await import(
      '@/components/features/admin/CapabilityEvidenceMatrix'
    );
    render(<CapabilityEvidenceMatrix record={record()} />);

    const matrix = screen.getByTestId('capability-evidence-matrix');
    expect(matrix).toHaveAttribute('data-stage', 'healthy');
    expect(matrix).toHaveTextContent('Public profile pages');
    expect(matrix).toHaveTextContent('1.2.3 bbbbbbb (production)');
    expect(matrix).toHaveTextContent('128 in 7d');
    expect(matrix).toHaveTextContent('Running Client: unknown');
    expect(
      screen.getByRole('link', { name: 'Deployed commit →' })
    ).toHaveAttribute(
      'href',
      `https://github.com/JovieInc/Jovie/commit/${'b'.repeat(40)}`
    );
  });

  it('keeps unobserved states honest', async () => {
    const { CapabilityEvidenceMatrix } = await import(
      '@/components/features/admin/CapabilityEvidenceMatrix'
    );
    render(
      <CapabilityEvidenceMatrix
        record={record({
          deployment: {
            commitSha: null,
            version: null,
            environment: null,
            deploymentId: null,
          },
        })}
      />
    );

    expect(screen.getByTestId('capability-evidence-matrix')).toHaveAttribute(
      'data-stage',
      'merged-only'
    );
    expect(
      screen.queryByRole('link', { name: 'Deployed commit →' })
    ).toBeNull();
  });
});
