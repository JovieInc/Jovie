import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
  DSP_GLYPH_ON_BRAND_TEXT_CLASS,
  type DspAvatarItem,
  DspAvatarStack,
} from './DspAvatarStack';

const ITEMS: DspAvatarItem[] = [
  {
    id: 'apple',
    status: 'pending',
    label: 'Apple Music',
    glyph: 'A',
    color: '#FA243C',
  },
  {
    id: 'spotify',
    status: 'live',
    label: 'Spotify',
    glyph: 'S',
    color: '#1DB954',
  },
  {
    id: 'youtube',
    status: 'missing',
    label: 'YouTube',
    glyph: 'Y',
    color: '#FF0000',
  },
];

function DspWithThemeShortcut() {
  const [theme, setTheme] = useState('light');
  useKeyboardShortcuts([
    {
      key: 'Alt+t',
      description: 'Cycle theme',
      handler: () =>
        setTheme(current => (current === 'light' ? 'dark' : 'light')),
    },
  ]);

  return (
    <>
      <DspAvatarStack dsps={ITEMS} />
      <output aria-label='Theme'>{theme}</output>
    </>
  );
}

async function revealDetails() {
  await userEvent.click(
    screen.getByRole('button', { name: /^View DSP Distribution Details/i })
  );
  return screen.getByRole('dialog', { name: 'DSP Distribution Details' });
}

describe('DspAvatarStack', () => {
  it('returns null for an empty input', () => {
    const { container } = render(<DspAvatarStack dsps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the live count over the total', async () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    await revealDetails();
    expect(screen.getByText('1/3 Live')).toBeInTheDocument();
  });

  it('renders an overflow chip when more than one DSP is provided', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does not render an overflow chip for a single DSP', () => {
    render(<DspAvatarStack dsps={[ITEMS[1]]} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it.each([
    { dsps: ITEMS, maxVisible: 1, name: 'View DSP Distribution Details +2' },
    { dsps: ITEMS, maxVisible: 2, name: 'View DSP Distribution Details +1' },
    { dsps: ITEMS, maxVisible: 3, name: 'View DSP Distribution Details' },
    { dsps: [ITEMS[1]], maxVisible: 1, name: 'View DSP Distribution Details' },
  ])(
    'names the DSP trigger from its content with maxVisible=$maxVisible and $dsps.length DSPs (WCAG 2.5.3, JOV-8781)',
    ({ dsps, maxVisible, name }) => {
      render(<DspAvatarStack dsps={dsps} maxVisible={maxVisible} />);

      const trigger = screen.getByRole('button', {
        name: /View DSP Distribution Details/,
      });
      expect(trigger).not.toHaveAttribute('aria-label');
      expect(trigger).not.toHaveAttribute('aria-labelledby');
      expect(trigger).toHaveAccessibleName(name);
    }
  );

  it('lists every DSP label inside the popover', async () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    await revealDetails();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Apple Music')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
  });

  it('portals details outside the containing row', async () => {
    render(
      <div data-testid='containing-row'>
        <DspAvatarStack dsps={ITEMS} />
      </div>
    );
    const dialog = await revealDetails();
    expect(document.body).toContainElement(dialog);
    expect(screen.getByTestId('containing-row')).not.toContainElement(dialog);
  });

  it('previews details on keyboard focus without moving focus', async () => {
    const user = userEvent.setup();
    render(<DspAvatarStack dsps={ITEMS} />);

    const trigger = screen.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });
    await user.tab();
    const dialog = screen.getByRole('dialog', {
      name: 'DSP Distribution Details',
    });

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('preserves native activation, focus, and Tab navigation', async () => {
    const user = userEvent.setup();
    render(
      <>
        <DspAvatarStack dsps={ITEMS} />
        <button type='button'>Next control</button>
      </>
    );

    const trigger = screen.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });
    const clicks: MouseEvent[] = [];
    const keydowns: KeyboardEvent[] = [];
    trigger.addEventListener('click', event => clicks.push(event));
    trigger.addEventListener('keydown', event => keydowns.push(event));

    await user.click(trigger);
    expect(clicks).toHaveLength(1);
    const details = screen.getByRole('dialog', {
      name: 'DSP Distribution Details',
    });
    expect(details).toHaveFocus();

    act(() => trigger.focus());
    await user.keyboard('{Enter}');
    expect(clicks).toHaveLength(2);
    expect(details).toHaveFocus();

    act(() => trigger.focus());
    await user.keyboard(' ');
    expect(clicks).toHaveLength(3);
    expect(details).toHaveFocus();

    await user.tab();
    expect(details).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
    expect(clicks.map(event => event.defaultPrevented)).toEqual([
      false,
      false,
      false,
    ]);
    expect(keydowns.map(event => [event.key, event.defaultPrevented])).toEqual([
      ['Enter', false],
      [' ', false],
      ['Tab', false],
    ]);
  });

  it('lets nonactivation shortcuts reach the shared keyboard handler', async () => {
    const user = userEvent.setup();
    render(<DspWithThemeShortcut />);
    const trigger = screen.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Theme' })).toHaveTextContent(
      'light'
    );

    await user.keyboard('{Alt>}t{/Alt}');

    expect(screen.getByRole('status', { name: 'Theme' })).toHaveTextContent(
      'dark'
    );
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const details = screen.getByRole('dialog', {
      name: 'DSP Distribution Details',
    });
    expect(details).toHaveFocus();
    await user.keyboard('{Alt>}t{/Alt}');
    expect(screen.getByRole('status', { name: 'Theme' })).toHaveTextContent(
      'light'
    );
    expect(details).toHaveFocus();
  });

  it('reopens a focus preview after Escape, blur, and a new Tab focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type='button'>Previous control</button>
        <DspAvatarStack dsps={ITEMS} />
      </>
    );
    await user.tab();
    await user.tab();
    const trigger = screen.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
    await user.tab({ shift: true });
    expect(
      screen.getByRole('button', { name: 'Previous control' })
    ).toHaveFocus();
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each(['Tab', 'pointer'] as const)(
    'dismisses on outside %s without stealing focus',
    async method => {
      const user = userEvent.setup();
      render(
        <>
          <DspAvatarStack dsps={ITEMS} />
          <button type='button'>Next control</button>
        </>
      );
      await user.tab();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const next = screen.getByRole('button', { name: 'Next control' });
      if (method === 'Tab') await user.tab();
      else await user.click(next);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(next).toHaveFocus();
    }
  );

  it('does not steal a new outside focus while Escape dismissal finishes', async () => {
    render(
      <>
        <DspAvatarStack dsps={ITEMS} />
        <button type='button'>Next control</button>
      </>
    );
    await revealDetails();
    const details = screen.getByRole('dialog', {
      name: 'DSP Distribution Details',
    });
    const next = screen.getByRole('button', { name: 'Next control' });
    expect(details).toHaveFocus();

    fireEvent.keyDown(details, { key: 'Escape' });
    act(() => next.focus());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(next).toHaveFocus();
  });

  it('falls back to text glyph when no iconPath is provided', async () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    await revealDetails();
    // Glyphs appear in the stacked avatar and/or the popover list.
    expect(screen.getAllByText('S').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Y').length).toBeGreaterThan(0);
  });

  it('surfaces brand color via CSS custom properties', async () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    await revealDetails();

    // Primary (live) and missing items render with brand color CSS var
    const avatars = document.querySelectorAll(
      '[style*="--system-b-dsp-avatar-color"]'
    );
    const styleAttrs = Array.from(avatars).map(
      el => el.getAttribute('style') ?? ''
    );

    expect(styleAttrs.some(s => s.includes('#1DB954'))).toBe(true);
    expect(styleAttrs.some(s => s.includes('#FF0000'))).toBe(true);
  });

  it('avoids Tailwind color utility classes for DSP brand colors', async () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    await revealDetails();
    const liveDot = document.querySelector('.system-b-dsp-status-dot-live');
    expect(liveDot).not.toBeNull();
    expect(liveDot?.className).not.toContain('bg-emerald');
  });

  it('applies brand hover text color only to icon avatars, not glyph avatars', () => {
    const iconItem: DspAvatarItem = {
      id: 'spotify',
      status: 'live',
      label: 'Spotify',
      glyph: 'S',
      iconPath: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12',
      color: '#1DB954',
    };

    const { container: iconContainer } = render(
      <DspAvatarStack dsps={[iconItem]} />
    );
    const iconAvatar = iconContainer.querySelector(
      '[style*="--system-b-dsp-avatar-color"]'
    );
    expect(iconAvatar?.className).toContain('group-hover/dsps:text-');

    const { container: glyphContainer } = render(
      <DspAvatarStack dsps={[ITEMS[1]]} />
    );
    const glyphAvatar = glyphContainer.querySelector(
      '[style*="--system-b-dsp-avatar-color"]'
    );
    // Glyph avatars keep white text on hover — the brand bg would make the
    // glyph invisible if the hover text color matched it.
    expect(glyphAvatar?.className).not.toContain('group-hover/dsps:text-');
    expect(glyphAvatar?.className).toContain(DSP_GLYPH_ON_BRAND_TEXT_CLASS);
  });

  it('keeps missing glyph avatars faded at opacity-40 without opacity-75', () => {
    const { container } = render(<DspAvatarStack dsps={[ITEMS[2]]} />);
    const avatar = container.querySelector(
      '[style*="--system-b-dsp-avatar-color"]'
    );
    expect(avatar?.className).toContain('opacity-40');
    expect(avatar?.className).not.toContain('opacity-75');
  });
});
