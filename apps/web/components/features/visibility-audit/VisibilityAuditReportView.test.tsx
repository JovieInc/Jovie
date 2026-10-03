import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import type { VisibilityAuditReport } from '@/lib/visibility-audit/types';
import { VisibilityAuditReportView } from './VisibilityAuditReportView';

const TIM_WHITE_REPORT = assembleVisibilityAudit(
  TIM_WHITE_VISIBILITY_AUDIT_INPUT
);

describe('VisibilityAuditReportView', () => {
  it('renders the stored Tim sample without implying that missing evidence was checked', () => {
    render(<VisibilityAuditReportView report={TIM_WHITE_REPORT} />);

    const report = screen.getByTestId('visibility-audit-report');
    expect(report).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'Digital Footprint & Visibility Audit',
      })
    );
    expect(screen.getByText('Tim White · https://jov.ie/tim')).toBeVisible();
    expect(screen.getByText(TIM_WHITE_REPORT.evidenceNote ?? '')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: `DSP Presence (${TIM_WHITE_REPORT.dspPresence.presentCount} Of ${TIM_WHITE_REPORT.dspPresence.registryCount})`,
      })
    ).toBeVisible();
    expect(screen.getByText('No conflicts recorded.')).toBeVisible();
    expect(screen.getByText('SerpAPI requests: 0')).toBeVisible();
    expect(screen.getAllByText(/: not checked$/).length).toBeGreaterThan(0);
    expect(screen.getByText('0 rows')).toBeVisible();
    expect(screen.getByText('facebook: missing')).toBeVisible();
    expect(
      screen.getByText(/^Submission .+ \(mapped, not preparable\)$/)
    ).toBeVisible();
    expect(screen.getByText('Submission xperi_allmusic_email')).toBeVisible();
    expect(screen.getByText(/^DSP bio sync: /)).toBeVisible();
    expect(screen.getByText('Manual: configure_ad_pixels')).toBeVisible();
  });

  it('renders recorded conflicts, identity values, citations, and singular catalog rows', () => {
    const firstQuestion = TIM_WHITE_REPORT.citations.questions[0];
    if (!firstQuestion)
      throw new Error('Expected a canonical citation question');

    const report: VisibilityAuditReport = {
      ...TIM_WHITE_REPORT,
      evidenceNote: null,
      identity: {
        ...TIM_WHITE_REPORT.identity,
        steps: TIM_WHITE_REPORT.identity.steps.map(step =>
          step.id === 'mbid'
            ? { ...step, status: 'present', values: ['test-mbid'] }
            : step
        ),
      },
      linkGraph: {
        ...TIM_WHITE_REPORT.linkGraph,
        conflicts: [
          {
            kind: 'handle_mismatch',
            summary: 'Instagram has conflicting handles.',
          },
        ],
      },
      citations: {
        ...TIM_WHITE_REPORT.citations,
        questions: [
          {
            ...firstQuestion,
            checks: [
              {
                engine: 'chatgpt',
                question: firstQuestion.question,
                cited: false,
                matchedUrl: null,
                checkedAt: '2026-10-02T00:00:00.000Z',
              },
            ],
          },
          ...TIM_WHITE_REPORT.citations.questions.slice(1),
        ],
      },
      catalog: {
        ...TIM_WHITE_REPORT.catalog,
        mismatches: [
          {
            isrc: 'USRC17607839',
            mismatchType: 'missing_from_dsp',
            status: 'flagged',
          },
        ],
      },
      pixels: {
        rows: TIM_WHITE_REPORT.pixels.rows.map(row =>
          row.platform === 'facebook'
            ? { ...row, present: true, pixelIds: ['pixel-1'] }
            : row
        ),
      },
    };

    render(<VisibilityAuditReportView report={report} />);

    expect(
      screen.queryByText(TIM_WHITE_REPORT.evidenceNote ?? '')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('MusicBrainz MBID: present (test-mbid)')
    ).toBeVisible();
    expect(
      screen.getByText('Instagram has conflicting handles.')
    ).toBeVisible();
    expect(
      screen.getByText(`${firstQuestion.question}: 1 manual`)
    ).toBeVisible();
    expect(screen.getByText('1 row')).toBeVisible();
    expect(screen.getByText('facebook: present')).toBeVisible();
  });
});
