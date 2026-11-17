import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspQuietRow } from './DspQuietRow';

const icon = <span aria-hidden='true'>S</span>;

describe('DspQuietRow certificate', () => {
  it('links a saved provider URL and stays axe-clean', async () => {
    const { container } = render(
      <DspQuietRow
        label='Spotify'
        icon={icon}
        href='https://open.spotify.com/album/take-me-over'
        showUrl
      />
    );
    const link = screen.getByRole('link', {
      name: 'Spotify open.spotify.com/album/take-me-over',
      exact: true,
    });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('open.spotify.com/album/take-me-over');
    expect(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    ).toHaveAttribute('aria-haspopup', 'menu');
    expect(
      screen.queryByRole('button', { name: 'Find' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('treats a blank saved URL as empty and calls onFind from the Find button', async () => {
    const user = userEvent.setup();
    const onFind = vi.fn();
    const { container } = render(
      <DspQuietRow
        label='Apple Music'
        icon={icon}
        href='   '
        onFind={onFind}
        findLabel='Find Apple Music'
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find Apple Music' }));
    expect(onFind).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps a long label and URL inside truncating spans', async () => {
    const label = 'Amazon Music Unlimited (Ultra HD and Spatial Audio)';
    const { container } = render(
      <DspQuietRow
        label={label}
        icon={icon}
        href='https://www.music.amazon.com/albums/B0EXAMPLE1234567890/'
        showUrl
      />
    );
    expect(screen.getByText(label)).toHaveClass('truncate');
    expect(
      screen.getByText('music.amazon.com/albums/B0EXAMPLE1234567890')
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('renders an RTL read-only row with no actions axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DspQuietRow label='سبوتيفاي' icon={icon} href={null} />
      </div>
    );
    expect(screen.getByText('سبوتيفاي')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
