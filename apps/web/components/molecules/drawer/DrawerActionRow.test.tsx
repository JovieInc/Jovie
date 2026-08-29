import { fireEvent, render, screen } from '@testing-library/react';
import { ArrowRight } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerActionRow } from './DrawerActionRow';

describe('DrawerActionRow', () => {
  it('renders a named action with optional trailing content and handles activation', () => {
    const onClick = vi.fn();

    const { rerender } = render(
      <DrawerActionRow
        label='Open public profile'
        onClick={onClick}
        icon={<span aria-hidden='true'>Icon</span>}
        trailing={<ArrowRight aria-hidden='true' />}
      />
    );

    const action = screen.getByRole('button', { name: 'Open public profile' });
    expect(action).toHaveTextContent('Open public profile');
    expect(action.querySelector('[aria-hidden="true"]')).not.toBeNull();

    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<DrawerActionRow label='View release notes' />);
    expect(
      screen.getByRole('button', { name: 'View release notes' })
    ).toHaveTextContent('View release notes');
  });
});
