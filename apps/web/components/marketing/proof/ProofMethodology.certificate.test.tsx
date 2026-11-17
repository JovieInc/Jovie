import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROOF_METHODOLOGY_COPY } from '@/data/proofMethodologyCopy';
import { listProofStats } from '@/lib/proof-stats/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProofMethodology } from './ProofMethodology';

const STATS = listProofStats();
const PUBLIC_STATS = STATS.filter(
  stat => stat.visibility === 'public' && stat.publicMethod && stat.methodology
);

describe('ProofMethodology certificate', () => {
  it('lists one method per public stat axe-clean', async () => {
    const { container } = render(<ProofMethodology stats={STATS} />);

    expect(container.querySelectorAll('dl > div')).toHaveLength(
      PUBLIC_STATS.length
    );
    expect(
      screen.getByRole('heading', {
        name: PROOF_METHODOLOGY_COPY.rules.heading,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the rules and benchmark copy with an empty registry', async () => {
    const { container } = render(<ProofMethodology stats={[]} />);

    expect(container.querySelectorAll('dl > div')).toHaveLength(0);
    expect(
      screen.getByText(PROOF_METHODOLOGY_COPY.benchmark.body)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a long method whole and stays axe-clean', async () => {
    const [first] = PUBLIC_STATS;
    const publicMethod = `${first.publicMethod} ${first.publicMethod}`;
    const { container } = render(
      <ProofMethodology stats={[{ ...first, publicMethod }]} />
    );

    expect(screen.getByText(publicMethod)).toBeInTheDocument();
    expect(container.querySelector(`[id="${first.id}"]`)).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProofMethodology stats={PUBLIC_STATS.slice(0, 2)} />
      </div>
    );

    expect(container.querySelectorAll('dl > div')).toHaveLength(
      Math.min(2, PUBLIC_STATS.length)
    );
    await expectNoA11yViolations(container);
  });
});
