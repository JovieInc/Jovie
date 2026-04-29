import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoLiveInSixtySection } from '@/components/marketing/go-live-in-sixty-section';

describe('GoLiveInSixtySection', () => {
  it('renders the headline and three action columns', () => {
    render(<GoLiveInSixtySection />);

    expect(
      screen.getByRole('heading', { name: 'Go Live. In 60 Seconds.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '1. Catch The Signal' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2. Turn It Into Action' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '3. Compound The Motion' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Jovie watches the release, store, and fan moments that usually slip past the team.'
      )
    ).toBeInTheDocument();
  });
});
