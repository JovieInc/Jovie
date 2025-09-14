import { Button } from '@jovie/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataCard } from '@/components/ui/DataCard';

describe('DataCard', () => {
  afterEach(cleanup);

  it('renders correctly with title', () => {
    render(<DataCard title='Test Card' />);

    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });

  it('renders with subtitle', () => {
    render(<DataCard title='Test Card' subtitle='Subtitle text' />);

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('renders with metadata', () => {
    render(
      <DataCard
        title='Test Card'
        subtitle='Subtitle text'
        metadata='Additional info'
      />
    );

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
    expect(screen.getByText('Additional info')).toBeInTheDocument();
  });

  it('renders with badge', () => {
    render(<DataCard title='Test Card' badge='New' />);

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders with different badge variants', () => {
    const { rerender } = render(
      <DataCard title='Test Card' badge='Success' badgeVariant='success' />
    );

    expect(screen.getByText('Success')).toHaveClass('bg-green-100');

    rerender(
      <DataCard title='Test Card' badge='Warning' badgeVariant='warning' />
    );
    expect(screen.getByText('Warning')).toHaveClass('bg-yellow-100');

    rerender(<DataCard title='Test Card' badge='Error' badgeVariant='error' />);
    expect(screen.getByText('Error')).toHaveClass('bg-red-100');

    rerender(
      <DataCard title='Test Card' badge='Default' badgeVariant='default' />
    );
    expect(screen.getByText('Default')).toHaveClass('bg-surface-hover');
  });

  it('renders with actions', () => {
    render(<DataCard title='Test Card' actions={<Button>Action</Button>} />);

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('renders with children', () => {
    render(
      <DataCard title='Test Card'>
        <div data-testid='custom-content'>Custom content</div>
      </DataCard>
    );

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<DataCard title='Test Card' className='custom-card' />);

    const card = screen
      .getByText('Test Card')
      .closest('div[class*="flex items-center justify-between"]');
    expect(card).toHaveClass('custom-card');
  });

  it('renders with proper layout classes', () => {
    render(<DataCard title='Test Card' />);

    const card = screen
      .getByText('Test Card')
      .closest('div[class*="flex items-center justify-between"]');
    expect(card).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('renders with dark mode classes', () => {
    render(<DataCard title='Test Card' />);

    const card = screen
      .getByText('Test Card')
      .closest('div[class*="flex items-center justify-between"]');
    expect(card).toHaveClass('border-subtle');
  });

  it('handles long titles with truncation', () => {
    const longTitle =
      'This is a very long title that should be truncated when it exceeds the available space';
    render(<DataCard title={longTitle} />);

    const titleElement = screen.getByText(longTitle);
    expect(titleElement).toHaveClass('truncate');
  });

  it('handles long subtitles with truncation', () => {
    const longSubtitle =
      'This is a very long subtitle that should be truncated when it exceeds the available space';
    render(<DataCard title='Test Card' subtitle={longSubtitle} />);

    const subtitleElement = screen.getByText(longSubtitle);
    expect(subtitleElement).toHaveClass('truncate');
  });

  it('renders without actions when not provided', () => {
    render(<DataCard title='Test Card' />);

    const card = screen.getByText('Test Card').closest('div');
    const actionsContainer = card?.querySelector('.flex-shrink-0');
    expect(actionsContainer).not.toBeInTheDocument();
  });

  it('renders with proper badge styling', () => {
    render(<DataCard title='Test Card' badge='Test Badge' />);

    const badge = screen.getByText('Test Badge');
    expect(badge).toHaveClass(
      'inline-block',
      'px-2',
      'py-1',
      'text-xs',
      'rounded-full'
    );
  });

  it('handles empty strings gracefully', () => {
    render(<DataCard title='Test Card' subtitle='' metadata='' badge='' />);

    expect(screen.getByText('Test Card')).toBeInTheDocument();
    // Empty strings should not be rendered as text content
    expect(screen.queryByText('subtitle=""')).not.toBeInTheDocument();
    expect(screen.queryByText('metadata=""')).not.toBeInTheDocument();
    expect(screen.queryByText('badge=""')).not.toBeInTheDocument();
  });

  it('renders with proper spacing for metadata', () => {
    render(<DataCard title='Test Card' metadata='Metadata text' />);

    const metadataElement = screen.getByText('Metadata text');
    expect(metadataElement).toHaveClass('text-xs', 'text-secondary');
  });
});
