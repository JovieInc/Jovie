import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataCard } from '@/components/molecules/DataCard';

describe('DataCard', () => {
  it('renders primary content', () => {
    render(
      <DataCard
        title='Test Card'
        subtitle='Subtitle text'
        metadata='Additional info'
        badge='New'
      />
    );

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
    expect(screen.getByText('Additional info')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <DataCard title='Test Card'>
        <div data-testid='custom-content'>Custom content</div>
      </DataCard>
    );

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
  });

  it('renders provided actions', () => {
    render(<DataCard title='Test Card' actions={<Button>Action</Button>} />);

    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<DataCard title='Test Card' className='custom-card' />);

    const card = screen
      .getByText('Test Card')
      .closest('div[class*="flex items-center justify-between"]');
    expect(card).toHaveClass('custom-card');
  });
});
