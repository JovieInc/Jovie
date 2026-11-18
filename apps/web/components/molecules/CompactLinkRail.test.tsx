import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { CompactLinkRailItem } from './CompactLinkRail';
import { CompactLinkRail } from './CompactLinkRail';

const item = (
  id: string,
  platformName: string,
  primaryText: string,
  onClick?: () => void
): CompactLinkRailItem => ({
  id,
  platformIcon: id,
  platformName,
  primaryText,
  onClick,
});

describe('CompactLinkRail', () => {
  it('renders nothing for an empty rail', () => {
    const { container } = render(
      <CompactLinkRail items={[]} countLabel='platforms' />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('expands a single link and fires its click handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <CompactLinkRail
        items={[item('instagram', 'Instagram', '12.4k', onClick)]}
        countLabel='platforms'
      />
    );

    expect(container.querySelector('[title="1 platforms"]')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Select Instagram: 12.4k' })
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('collapses many links behind a summary count and caps visible pills', async () => {
    const user = userEvent.setup();
    const onSpotify = vi.fn();
    const items = [
      item('instagram', 'Instagram', '12.4k', vi.fn()),
      item('spotify', 'Spotify', '8.1k', onSpotify),
      item('youtube', 'YouTube', '3.2k', vi.fn()),
      item('tiktok', 'TikTok', '2.9k', vi.fn()),
      item('soundcloud', 'SoundCloud', '1.1k', vi.fn()),
    ];
    const { container } = render(
      <CompactLinkRail
        items={items}
        countLabel='platforms'
        summaryCount={9}
        summaryAriaLabel='9 connected platforms'
      />
    );

    expect(
      container.querySelector('[title="9 connected platforms"]')
    ).toHaveTextContent('9');
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /TikTok/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Spotify: 8.1k' }));
    expect(onSpotify).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders partial static links and an RTL rail axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CompactLinkRail
          items={[
            item('spotify', 'Spotify', '8.1k'),
            item('youtube', 'YouTube', '3.2k'),
          ]}
          countLabel='منصات'
          maxVisible={2}
        />
      </div>
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[title="2 منصات"]')).toHaveTextContent('2');
    await expectNoA11yViolations(container);
  });
});
