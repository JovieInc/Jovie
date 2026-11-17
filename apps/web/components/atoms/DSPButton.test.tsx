import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DSPButton } from './DSPButton';

const LOGO =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="currentColor"/><script>alert(1)</script></svg>';

const baseProps = {
  name: 'Spotify',
  dspKey: 'spotify',
  url: 'https://open.spotify.com/artist/example',
  backgroundColor: '#1DB954',
  textColor: '#000000',
  logoSvg: LOGO,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DSPButton', () => {
  it('hands the service key and url to onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DSPButton {...baseProps} onClick={onClick} />
    );

    const button = screen.getByRole('button', {
      name: 'Open in Spotify (opens in new window)',
    });
    expect(container.querySelector('script')).toBeNull();
    await user.click(button);

    expect(onClick).toHaveBeenCalledWith(
      'spotify',
      'https://open.spotify.com/artist/example'
    );
    await expectNoA11yViolations(container);
  });

  it('opens an external url in a new window when no handler is given', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    render(<DSPButton {...baseProps} />);

    await user.click(screen.getByRole('button'));
    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/example',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('stays inert while disabled and drops the brand accent', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DSPButton {...baseProps} onClick={onClick} disabled />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    const logo = container.querySelector(
      'span[aria-hidden="true"]'
    ) as HTMLElement;
    expect(logo.style.color).toBe('');
    await expectNoA11yViolations(container);
  });

  it('labels a partial, long and RTL button without a logo', async () => {
    const { container, unmount } = render(
      <DSPButton
        {...baseProps}
        name='Amazon Music Unlimited HD and Spatial Audio'
        url='/listen/amazon'
        logoSvg=''
        backgroundColor=''
        textColor=''
      />
    );
    expect(
      screen.getByRole('button', {
        name: 'Open in Amazon Music Unlimited HD and Spatial Audio',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <DSPButton {...baseProps} name='أنغامي' />
      </div>
    );
    expect(screen.getByText('Open in أنغامي')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
