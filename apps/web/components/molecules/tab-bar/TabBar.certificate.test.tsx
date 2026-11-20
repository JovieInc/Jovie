import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TabBar } from './TabBar';

type Tab = 'details' | 'activity' | 'sources';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources', disabled: true },
] as const;

function Harness({ onChange }: { readonly onChange: (tab: Tab) => void }) {
  const [value, setValue] = useState<Tab>('details');
  return (
    <TabBar<Tab>
      value={value}
      onValueChange={next => {
        setValue(next);
        onChange(next);
      }}
      options={options}
      ariaLabel='Entity tabs'
      overflowMode='wrap'
    />
  );
}

describe('TabBar certificate', () => {
  it('selects a tab on click and keeps disabled tabs inert', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('tab', { name: 'Activity' }));

    expect(onChange).toHaveBeenCalledWith('activity');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Sources' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('renders the segment variant right to left without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TabBar
          value='details'
          onValueChange={vi.fn()}
          options={[
            { value: 'details', label: 'التفاصيل' },
            { value: 'activity', label: 'النشاط' },
          ]}
          ariaLabel='علامات التبويب'
          variant='segment'
          overflowMode='wrap'
        />
      </div>
    );
    expect(screen.getByRole('tab', { name: 'التفاصيل' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
