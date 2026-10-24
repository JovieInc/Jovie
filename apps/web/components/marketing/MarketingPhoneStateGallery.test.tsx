import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MarketingPhoneStateGallery } from './MarketingPhoneStateGallery';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

const STATES = [
  {
    id: 'listen',
    scenarioId: 'tim-white-profile-listen-mobile',
    alt: 'Profile showing the music catalog.',
    title: 'Listen',
    body: 'Fans land on the right release.',
  },
  {
    id: 'stay-close',
    scenarioId: 'tim-white-profile-subscribe-mobile',
    alt: 'Profile asking a fan to get updates.',
    title: 'Stay Close',
    body: 'A signup becomes a relationship.',
  },
] as const;

describe('MarketingPhoneStateGallery', () => {
  it('renders one registry capture and caption per state, in order', () => {
    render(
      <MarketingPhoneStateGallery states={STATES} label='Profile states' />
    );
    const region = screen.getByRole('region', { name: 'Profile states' });
    expect(region).toHaveAttribute('data-count', '2');
    const figures = within(region).getAllByRole('figure');
    expect(figures).toHaveLength(2);
    STATES.forEach((state, index) => {
      const figure = figures[index];
      expect(within(figure).getByRole('img')).toHaveAttribute(
        'src',
        getMarketingExportImage(state.scenarioId).publicUrl
      );
      expect(within(figure).getByRole('img')).toHaveAttribute('alt', state.alt);
      expect(figure).toHaveTextContent(state.title);
      expect(figure).toHaveTextContent(state.body);
    });
  });

  it('keeps the scrollable rail reachable by keyboard', () => {
    render(
      <MarketingPhoneStateGallery states={STATES} label='Profile states' />
    );
    expect(
      screen.getByRole('region', { name: 'Profile states' })
    ).toHaveAttribute('tabindex', '0');
  });

  it('fails loudly on an unregistered capture', () => {
    expect(() =>
      render(
        <MarketingPhoneStateGallery
          label='Profile states'
          states={[{ ...STATES[0], scenarioId: 'not-a-real-scenario' }]}
        />
      )
    ).toThrow(/Unknown screenshot scenario/);
  });
});
