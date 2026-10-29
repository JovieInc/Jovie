import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { listProofStats } from '@/lib/proof-stats/registry';
import { ProofMethodology } from './ProofMethodology';

describe('ProofMethodology', () => {
  it('lists every public stat with its method and rules, and no internal stat', () => {
    const stats = listProofStats();
    render(<ProofMethodology stats={stats} />);
    const publicStats = stats.filter(stat => stat.visibility === 'public');
    for (const stat of publicStats) {
      const entry = document.getElementById(stat.id);
      expect(entry, stat.id).not.toBeNull();
      expect(entry).toHaveTextContent(stat.publicMethod ?? '');
    }
    expect(document.getElementById('eng_merges_per_day')).toBeNull();
    const accounts = document.getElementById('accounts_total');
    expect(accounts).toHaveTextContent('Rounded down to 1 significant figure');
    expect(accounts).toHaveTextContent('Shown at 1,000 or more');
    expect(accounts).toHaveTextContent('Hidden if older than 26 hours');
    const ttfb = document.getElementById('profile_ttfb_ms');
    expect(ttfb).toHaveTextContent('Rounded up to the nearest 10 ms');
    expect(ttfb).toHaveTextContent('Shown at 200 ms or less');
    expect(ttfb).toHaveTextContent('Hidden if older than 9 days');
    expect(document.getElementById('profile_lcp_rank')).toHaveTextContent(
      'after founder review'
    );
    expect(document.getElementById('security_open_critical')).toHaveTextContent(
      'Shown exactly'
    );
  });

  it('never states a measured value', () => {
    render(<ProofMethodology stats={listProofStats()} />);
    expect(screen.queryByText(/Trusted by|\d+k\+/u)).not.toBeInTheDocument();
  });
});
