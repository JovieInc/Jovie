import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from '@/components/molecules/InfoBox';

describe('InfoBox', () => {
  it('renders correctly with children', () => {
    render(
      <InfoBox>
        <p>Test content</p>
      </InfoBox>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(
      <InfoBox title='Information'>
        <p>Test content</p>
      </InfoBox>
    );

    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders with different variants', () => {
    const { rerender } = render(
      <InfoBox title='Info' variant='info'>
        <p>Info content</p>
      </InfoBox>
    );

    const container = screen.getByText('Info').closest('div');
    expect(container).toHaveClass('bg-blue-50');

    rerender(
      <InfoBox title='Warning' variant='warning'>
        <p>Warning content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('bg-yellow-50');

    rerender(
      <InfoBox title='Success' variant='success'>
        <p>Success content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('bg-green-50');

    rerender(
      <InfoBox title='Error' variant='error'>
        <p>Error content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('bg-red-50');
  });

  it('renders with proper title styling for each variant', () => {
    const { rerender } = render(
      <InfoBox title='Info' variant='info'>
        <p>Content</p>
      </InfoBox>
    );

    const title = screen.getByText('Info');
    expect(title).toHaveClass('text-blue-900');

    rerender(
      <InfoBox title='Warning' variant='warning'>
        <p>Content</p>
      </InfoBox>
    );
    expect(title).toHaveClass('text-yellow-900');

    rerender(
      <InfoBox title='Success' variant='success'>
        <p>Content</p>
      </InfoBox>
    );
    expect(title).toHaveClass('text-green-900');

    rerender(
      <InfoBox title='Error' variant='error'>
        <p>Content</p>
      </InfoBox>
    );
    expect(title).toHaveClass('text-red-900');
  });

  it('renders with proper content styling for each variant', () => {
    const { rerender } = render(
      <InfoBox variant='info'>
        <p>Content</p>
      </InfoBox>
    );

    const content = screen.getByText('Content').closest('div');
    expect(content).toHaveClass('text-blue-800');

    rerender(
      <InfoBox variant='warning'>
        <p>Content</p>
      </InfoBox>
    );
    expect(content).toHaveClass('text-yellow-800');

    rerender(
      <InfoBox variant='success'>
        <p>Content</p>
      </InfoBox>
    );
    expect(content).toHaveClass('text-green-800');

    rerender(
      <InfoBox variant='error'>
        <p>Content</p>
      </InfoBox>
    );
    expect(content).toHaveClass('text-red-800');
  });

  it('applies custom className', () => {
    render(
      <InfoBox title='Test' className='custom-info'>
        <p>Content</p>
      </InfoBox>
    );

    const container = screen.getByText('Test').closest('div');
    expect(container).toHaveClass('custom-info');
  });

  it('renders with proper default styling classes', () => {
    render(
      <InfoBox title='Test'>
        <p>Content</p>
      </InfoBox>
    );

    const container = screen.getByText('Test').closest('div');
    expect(container).toHaveClass('rounded-lg', 'border', 'p-4');
  });

  it('renders with dark mode classes', () => {
    render(
      <InfoBox title='Test' variant='info'>
        <p>Content</p>
      </InfoBox>
    );

    const container = screen.getByText('Test').closest('div');
    expect(container).toHaveClass(
      'dark:bg-blue-900/20',
      'dark:border-blue-800'
    );
  });

  it('renders without title when not provided', () => {
    render(
      <InfoBox>
        <p>Content</p>
      </InfoBox>
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title as h3 element', () => {
    render(
      <InfoBox title='Test Title'>
        <p>Content</p>
      </InfoBox>
    );

    const title = screen.getByText('Test Title');
    expect(title.tagName).toBe('H3');
  });

  it('renders with proper text size for content', () => {
    render(
      <InfoBox>
        <p>Content</p>
      </InfoBox>
    );

    const content = screen.getByText('Content').closest('div');
    expect(content).toHaveClass('text-sm');
  });

  it('handles complex children content', () => {
    render(
      <InfoBox title='Complex Content'>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      </InfoBox>
    );

    expect(screen.getByText('Complex Content')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders with proper spacing for title', () => {
    render(
      <InfoBox title='Test Title'>
        <p>Content</p>
      </InfoBox>
    );

    const title = screen.getByText('Test Title');
    expect(title).toHaveClass('mb-2');
  });

  it('handles empty children gracefully', () => {
    render(<InfoBox title='Test'>{null}</InfoBox>);

    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('renders with proper border styling for each variant', () => {
    const { rerender } = render(
      <InfoBox title='Info' variant='info'>
        <p>Content</p>
      </InfoBox>
    );

    const container = screen.getByText('Info').closest('div');
    expect(container).toHaveClass('border-blue-200');

    rerender(
      <InfoBox title='Warning' variant='warning'>
        <p>Content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('border-yellow-200');

    rerender(
      <InfoBox title='Success' variant='success'>
        <p>Content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('border-green-200');

    rerender(
      <InfoBox title='Error' variant='error'>
        <p>Content</p>
      </InfoBox>
    );
    expect(container).toHaveClass('border-red-200');
  });
});
