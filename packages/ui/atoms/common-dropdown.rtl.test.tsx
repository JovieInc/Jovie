import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommonDropdown } from './common-dropdown';

describe('CommonDropdown RTL', () => {
  it('mirrors the submenu chevron and puts check indicators at the start', () => {
    render(
      <div dir='rtl' lang='ar'>
        <CommonDropdown
          open
          items={[
            {
              type: 'checkbox',
              id: 'show',
              label: 'إظهار',
              checked: true,
              onCheckedChange: vi.fn(),
            },
            {
              type: 'submenu',
              id: 'move',
              label: 'نقل إلى',
              items: [
                {
                  type: 'action',
                  id: 'folder',
                  label: 'مجلد',
                  onClick: vi.fn(),
                },
              ],
            },
          ]}
        />
      </div>
    );
    const checkbox = screen.getByRole('menuitemcheckbox', { name: 'إظهار' });
    expect(checkbox).toHaveClass('ps-7', 'pe-2');
    expect(checkbox.querySelector('span.absolute')).toHaveClass('start-2');
    const chevron = screen
      .getByRole('menuitem', { name: 'نقل إلى' })
      .querySelector('svg:last-of-type');
    expect(chevron).toHaveClass('ms-auto', 'rtl:rotate-180');
  });
});
