import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fundraisingRegistry } from '@/lib/investors/fundraising-registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InvestorBrief } from './InvestorBrief';

// Engagement tracking posts analytics beacons; the brief body is under test.
vi.mock('./PitchEngagement', () => ({ PitchEngagement: () => null }));

describe('InvestorBrief certificate', () => {
  it('renders the anonymous brief with its meeting, demo and deck actions axe-clean', async () => {
    const { container } = render(<InvestorBrief />);

    expect(screen.queryByText(/^For /)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: fundraisingRegistry.thesis,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download Deck As PDF' })
    ).toHaveAttribute('href', '/investor-portal/deck/Jovie-Pitch-Deck.pdf');
    const video = screen.getByLabelText('Jovie Product Walkthrough');
    expect(video.parentElement).toHaveClass('bg-ink-on-media');
    expect(video.parentElement?.className).not.toMatch(/\bbg-black\b/);
    await expectNoA11yViolations(container);
  });

  it('opens the founder letter and a risk answer from their summaries', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <InvestorBrief investorName='Example Capital' />
    );

    expect(screen.getByText('For Example Capital')).toBeInTheDocument();
    const letter = screen
      .getByText('Read The Founder Letter')
      .closest('details') as HTMLDetailsElement;
    expect(letter.open).toBe(false);
    await user.click(within(letter).getByText('Read The Founder Letter'));
    expect(letter.open).toBe(true);
    expect(within(letter).getByText('— Tim White, Founder')).toBeVisible();

    const [risk] = fundraisingRegistry.risks;
    const riskDetails = screen
      .getByText(risk.question)
      .closest('details') as HTMLDetailsElement;
    await user.click(within(riskDetails).getByText(risk.question));
    expect(riskDetails.open).toBe(true);
    await expectNoA11yViolations(container);
  });

  it('wraps a long investor name and stays axe-clean right to left', async () => {
    const name =
      'صندوق الاستثمار في الموسيقى المستقلة والتقنيات الإبداعية للشرق الأوسط';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InvestorBrief investorName={name} />
      </div>
    );

    expect(screen.getByText(`For ${name}`)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
