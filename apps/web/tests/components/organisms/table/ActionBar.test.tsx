import { render, screen } from '@testing-library/react';
import { Settings2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ActionBarButton } from '@/components/organisms/table';

describe('ActionBarButton', () => {
  it('renders icon with icon-only label treatment on mobile', () => {
    render(
      <ActionBarButton
        label='Display'
        icon={<Settings2 className='h-3.5 w-3.5' />}
        mobileIconOnly={true}
      />
    );

    const button = screen.getByRole('button', { name: 'Display' });
    expect(button).toBeInTheDocument();

    const label = screen.getByText('Display');
    expect(label).toHaveClass('hidden');
    expect(label).toHaveClass('sm:inline');
  });
});
