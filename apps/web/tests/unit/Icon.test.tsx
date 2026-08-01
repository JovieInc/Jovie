import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '@/components/atoms/Icon';

describe('Icon', () => {
  // ship-gate: keep unit coverage linked when Icon registry changes
  it('renders specified icon', () => {
    render(<Icon name='AlarmClock' data-testid='icon' />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies className and size props', () => {
    render(
      <Icon
        name='Activity'
        data-testid='icon'
        className='text-red-500'
        size={32}
      />
    );
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveClass('text-red-500');
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
  });

  it('normalizes various icon name formats', () => {
    render(<Icon name='alarm-clock' data-testid='kebab' />);
    expect(screen.getByTestId('kebab')).toBeInTheDocument();

    render(<Icon name='ActivityIcon' data-testid='suffix' />);
    expect(screen.getByTestId('suffix')).toBeInTheDocument();
  });

  it('renders integration-state icons used by the Bandsintown setup flow (JOV-4463)', () => {
    render(<Icon name='Key' data-testid='key-icon' />);
    expect(screen.getByTestId('key-icon')).toBeInTheDocument();

    render(<Icon name='CalendarDays' data-testid='calendar-days-icon' />);
    expect(screen.getByTestId('calendar-days-icon')).toBeInTheDocument();
  });

  it('registers authenticated sidebar, search, and rail glyphs (JOV-4701)', () => {
    const names = [
      'Home',
      'Inbox',
      'SquarePen',
      'Music',
      'IdCard',
      'Waypoints',
      'CalendarDays',
      'Search',
      'PanelLeft',
      'PanelLeftClose',
      'PanelLeftOpen',
      'PanelRight',
      'PanelRightClose',
      'PanelRightOpen',
    ] as const;

    for (const name of names) {
      render(<Icon name={name} data-testid={`icon-${name}`} />);
      expect(screen.getByTestId(`icon-${name}`)).toBeInTheDocument();
    }
  });

  it('registers sidebar thread utility glyphs (JOV-4716)', () => {
    const names = ['ArrowRight', 'MessageSquarePlus'] as const;

    for (const name of names) {
      render(<Icon name={name} data-testid={`icon-${name}`} />);
      expect(screen.getByTestId(`icon-${name}`)).toBeInTheDocument();
    }
  });

  it('returns null for unknown icon', () => {
    const { container } = render(
      <Icon name={'NotRealIcon' as any} data-testid='icon' />
    );
    expect(container.firstChild).toBeNull();
  });
});
