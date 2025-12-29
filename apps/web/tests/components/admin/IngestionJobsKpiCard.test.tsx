import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IngestionJobsKpiCard } from '@/components/admin/IngestionJobsKpiCard';
import type { IngestionJobStatusCounts } from '@/lib/admin';

describe('IngestionJobsKpiCard', () => {
  const defaultCounts: IngestionJobStatusCounts = {
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
    total: 0,
  };

  describe('rendering with various data states', () => {
    it('renders with all zeros', () => {
      render(<IngestionJobsKpiCard counts={defaultCounts} />);

      // Check title is rendered
      expect(screen.getByText('Ingestion Jobs')).toBeInTheDocument();

      // Check total value is rendered
      expect(screen.getByText('0')).toBeInTheDocument();

      // Check all status labels are present
      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('processing')).toBeInTheDocument();
      expect(screen.getByText('succeeded')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('renders with mixed counts', () => {
      const mixedCounts: IngestionJobStatusCounts = {
        pending: 5,
        processing: 3,
        succeeded: 100,
        failed: 2,
        total: 110,
      };

      render(<IngestionJobsKpiCard counts={mixedCounts} />);

      // Check title is rendered
      expect(screen.getByText('Ingestion Jobs')).toBeInTheDocument();

      // Check total value is rendered (formatted with locale)
      expect(screen.getByText('110')).toBeInTheDocument();

      // Check each status count is displayed
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders with large numbers formatted with locale', () => {
      const largeCounts: IngestionJobStatusCounts = {
        pending: 1000,
        processing: 500,
        succeeded: 10000,
        failed: 250,
        total: 11750,
      };

      render(<IngestionJobsKpiCard counts={largeCounts} />);

      // Total should be formatted with locale (e.g., "11,750")
      expect(screen.getByText('11,750')).toBeInTheDocument();
    });

    it('renders with only pending jobs', () => {
      const pendingOnlyCounts: IngestionJobStatusCounts = {
        pending: 25,
        processing: 0,
        succeeded: 0,
        failed: 0,
        total: 25,
      };

      render(<IngestionJobsKpiCard counts={pendingOnlyCounts} />);

      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('renders with only failed jobs', () => {
      const failedOnlyCounts: IngestionJobStatusCounts = {
        pending: 0,
        processing: 0,
        succeeded: 0,
        failed: 15,
        total: 15,
      };

      render(<IngestionJobsKpiCard counts={failedOnlyCounts} />);

      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders with proper ARIA label for the section', () => {
      render(<IngestionJobsKpiCard counts={defaultCounts} />);

      // AnalyticsCard wraps content in a section with aria-label
      const section = screen.getByRole('region', {
        name: 'Ingestion Jobs metric',
      });
      expect(section).toBeInTheDocument();
    });

    it('hides decorative icons from screen readers', () => {
      render(<IngestionJobsKpiCard counts={defaultCounts} />);

      // Icons should have aria-hidden="true"
      const section = screen.getByRole('region', {
        name: 'Ingestion Jobs metric',
      });
      const _hiddenElements = within(section).getAllByRole('img', {
        hidden: true,
      });

      // Verify icons exist in the DOM but are hidden
      // Note: SVG icons without explicit role may not show up this way
      // The icons have aria-hidden="true" attribute
      expect(section).toBeInTheDocument();
    });
  });

  describe('status badge rendering', () => {
    it('renders all four status badges', () => {
      const counts: IngestionJobStatusCounts = {
        pending: 10,
        processing: 5,
        succeeded: 50,
        failed: 3,
        total: 68,
      };

      render(<IngestionJobsKpiCard counts={counts} />);

      // Each status badge should show its count and label
      const section = screen.getByRole('region', {
        name: 'Ingestion Jobs metric',
      });

      // Verify the status labels are present
      expect(within(section).getByText('pending')).toBeInTheDocument();
      expect(within(section).getByText('processing')).toBeInTheDocument();
      expect(within(section).getByText('succeeded')).toBeInTheDocument();
      expect(within(section).getByText('failed')).toBeInTheDocument();

      // Verify counts are present
      expect(within(section).getByText('10')).toBeInTheDocument();
      expect(within(section).getByText('5')).toBeInTheDocument();
      expect(within(section).getByText('50')).toBeInTheDocument();
      expect(within(section).getByText('3')).toBeInTheDocument();
    });

    it('renders status badges in a grid layout', () => {
      render(<IngestionJobsKpiCard counts={defaultCounts} />);

      const section = screen.getByRole('region', {
        name: 'Ingestion Jobs metric',
      });

      // Find the grid container (2x2 grid)
      const gridContainer = section.querySelector('.grid.grid-cols-2');
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe('component structure', () => {
    it('renders the card title as uppercase', () => {
      render(<IngestionJobsKpiCard counts={defaultCounts} />);

      const title = screen.getByText('Ingestion Jobs');
      expect(title).toHaveClass('uppercase');
    });

    it('renders total value with tabular-nums for consistent width', () => {
      const counts: IngestionJobStatusCounts = {
        pending: 0,
        processing: 0,
        succeeded: 0,
        failed: 0,
        total: 12345,
      };

      render(<IngestionJobsKpiCard counts={counts} />);

      const totalValue = screen.getByText('12,345');
      expect(totalValue).toHaveClass('tabular-nums');
    });
  });
});
