import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EngineeringArticle,
  EngineeringIndex,
} from '@/components/marketing/engineering/EngineeringPublication';
import { evaluateEngineeringSource } from '@/lib/engineering-publication';

const record = evaluateEngineeringSource(
  `---\n${JSON.stringify({
    id: 'verified-changelog',
    title: 'Public shipping record',
    date: '2026-08-30',
    summary: 'Artists can read the public What is New page.',
    status: 'draft',
    availability: 'public',
    capabilities: [
      { id: 'changelog', availability: 'public', receiptId: 'changelog-live' },
    ],
    evidence: [
      {
        id: 'changelog-live',
        kind: 'changelog',
        href: 'https://jov.ie/changelog',
        claims: [],
      },
    ],
    founderApproval: null,
  })}\n---\n\nShipped copy.\n`,
  'verified-changelog'
);

describe('EngineeringPublication', () => {
  it('shows an empty public index without draft cards', () => {
    render(<EngineeringIndex stories={[]} />);
    expect(
      screen.getByText(
        'No founder-approved engineering stories are public yet.'
      )
    ).toBeVisible();
  });

  it('shows draft provenance, evidence, and reserved responsive space', () => {
    const view = render(<EngineeringIndex stories={[record]} preview />);
    expect(screen.getByText('Blocked')).toBeVisible();
    expect(screen.getByTestId('engineering-provenance')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Public shipping record' })
    ).toHaveAttribute('href', '/engineering/preview/verified-changelog');
    view.unmount();

    const { container } = render(
      <EngineeringArticle record={record} html='<p>Shipped copy.</p>' preview />
    );
    expect(screen.getByTestId('engineering-article')).toBeVisible();
    expect(screen.getByText('Evidence')).toBeVisible();
    expect(screen.getByText('https://jov.ie/changelog')).toBeVisible();
    expect(container.querySelector('h1')).toHaveClass('sm:text-5xl');
    expect(container.querySelector('.pb-20')).toHaveClass('sm:pb-28');
  });
});
