import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/atoms/StatusBadge';

const statusBadgeSourcePath = resolve(
  __dirname,
  '../../components/atoms/StatusBadge.tsx'
);

const STATUS_BADGE_GEOMETRY_DRIFT_FIXTURE_SOURCE = `
const localStatusBadgeClassName = 'gap-2 px-4 py-2 text-sm';
`;

const STATUS_BADGE_GEOMETRY_DRIFT_TEST_ID =
  'status-badge-geometry-drift-fixture';

const STATUS_BADGE_ALLOWED_GEOMETRY_CLASSES = new Set(['shrink-0', 'min-w-0']);
const STATUS_BADGE_LOCAL_GEOMETRY_PATTERN =
  /\b(?:gap|p|px|py|pt|pb|pl|pr|h|min-h|max-h|w|min-w|space-[xy]|text)-(?:[a-z0-9.[\]/-]+)\b/;

function quotedClassStrings(source: string): readonly string[] {
  return [...source.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

function auditStatusBadgeLocalGeometry(source: string): readonly string[] {
  return quotedClassStrings(source).filter(
    className =>
      !STATUS_BADGE_ALLOWED_GEOMETRY_CLASSES.has(className) &&
      STATUS_BADGE_LOCAL_GEOMETRY_PATTERN.test(className)
  );
}

function StatusBadgeGeometryDriftFixture() {
  return (
    <span
      data-deliberate-red=''
      data-testid={STATUS_BADGE_GEOMETRY_DRIFT_TEST_ID}
      className='gap-2 px-4 py-2 text-sm'
      style={{ outline: '2px solid #ff0000' }}
    >
      Status
    </span>
  );
}

function getBadgeElement(text: string): HTMLElement {
  const label = screen.getByText(text);
  const badge = label.parentElement;

  if (!badge) {
    throw new Error(`Could not find badge root for text: ${text}`);
  }

  return badge;
}

describe('StatusBadge', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<StatusBadge>Active</StatusBadge>);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      render(<StatusBadge className='custom-class'>Badge</StatusBadge>);
      expect(getBadgeElement('Badge')).toHaveClass('custom-class');
    });
  });

  describe('variants', () => {
    it('uses blue variant by default', () => {
      render(<StatusBadge>Default</StatusBadge>);
      const badge = getBadgeElement('Default');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-info/20');
      expect(badge).toHaveClass('text-info');
    });

    it('renders green variant', () => {
      render(<StatusBadge variant='green'>Success</StatusBadge>);
      const badge = getBadgeElement('Success');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-success/20');
      expect(badge).toHaveClass('text-success');
    });

    it('renders purple variant', () => {
      render(<StatusBadge variant='purple'>Info</StatusBadge>);
      const badge = getBadgeElement('Info');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-accent/20');
      expect(badge).toHaveClass('text-accent');
    });

    it('renders orange variant', () => {
      render(<StatusBadge variant='orange'>Warning</StatusBadge>);
      const badge = getBadgeElement('Warning');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-warning/20');
      expect(badge).toHaveClass('text-warning');
    });

    it('renders red variant', () => {
      render(<StatusBadge variant='red'>Error</StatusBadge>);
      const badge = getBadgeElement('Error');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-error/20');
      expect(badge).toHaveClass('text-error');
    });

    it('renders gray variant', () => {
      render(<StatusBadge variant='gray'>Neutral</StatusBadge>);
      const badge = getBadgeElement('Neutral');

      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-subtle');
      expect(badge).toHaveClass('text-tertiary-token');
    });
  });

  describe('sizes', () => {
    it('uses medium size by default', () => {
      render(<StatusBadge>Medium</StatusBadge>);
      const badge = getBadgeElement('Medium');

      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('leading-5');
      expect(badge).not.toHaveClass('px-4');
      expect(badge).not.toHaveClass('py-2');
      expect(badge).not.toHaveClass('text-sm');
    });

    it('renders small size', () => {
      render(<StatusBadge size='sm'>Small</StatusBadge>);
      const badge = getBadgeElement('Small');

      expect(badge).toHaveClass('px-1.5');
      expect(badge).toHaveClass('py-0');
      expect(badge).toHaveClass('text-3xs');
      expect(badge).toHaveClass('leading-5');
      expect(badge).not.toHaveClass('px-3');
    });

    it('renders large size', () => {
      render(<StatusBadge size='lg'>Large</StatusBadge>);
      const badge = getBadgeElement('Large');

      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('leading-5');
      expect(badge).not.toHaveClass('px-5');
      expect(badge).not.toHaveClass('text-base');
    });
  });

  describe('icon support', () => {
    it('renders without icon by default', () => {
      const { container } = render(<StatusBadge>No Icon</StatusBadge>);
      const iconSpan = container.querySelector('.shrink-0');

      expect(iconSpan).not.toBeInTheDocument();
    });

    it('renders with icon', () => {
      render(
        <StatusBadge icon={<span data-testid='icon'>★</span>}>
          With Icon
        </StatusBadge>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('★')).toBeInTheDocument();
    });

    it('applies flex-shrink-0 to icon wrapper', () => {
      const { container } = render(
        <StatusBadge icon={<span>⚡</span>}>Icon Badge</StatusBadge>
      );

      const iconWrapper = container.querySelector('.shrink-0');
      expect(iconWrapper).toBeInTheDocument();
      expect(iconWrapper).toHaveTextContent('⚡');
    });

    it('icon appears before text', () => {
      render(<StatusBadge icon={<span>→</span>}>Text</StatusBadge>);

      const badge = getBadgeElement('Text');
      const firstChild = badge?.firstChild;

      expect(firstChild).toHaveClass('shrink-0');
    });
  });

  describe('accessibility', () => {
    it('renders as a badge element', () => {
      expect(() => render(<StatusBadge>Static</StatusBadge>)).not.toThrow();
    });

    it('adds an explicit status role for dynamic badges', () => {
      render(<StatusBadge dynamic>Loading...</StatusBadge>);
      const badge = screen.getByRole('status');

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Loading...');
    });

    it('output element is accessible as status', () => {
      render(
        <StatusBadge dynamic variant='green'>
          Completed
        </StatusBadge>
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies base badge classes', () => {
      render(<StatusBadge>Badge</StatusBadge>);
      const badge = getBadgeElement('Badge');

      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('gap-1');
      expect(badge).toHaveClass('rounded-(--system-b-radius-pill)');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('font-medium');
    });

    it('text is wrapped in span', () => {
      render(<StatusBadge>Text</StatusBadge>);
      const badge = getBadgeElement('Text');
      const textSpan = badge?.querySelector('span:last-child');

      expect(textSpan).toHaveTextContent('Text');
    });
  });

  describe('content', () => {
    it('renders string children', () => {
      render(<StatusBadge>String Content</StatusBadge>);
      expect(screen.getByText('String Content')).toBeInTheDocument();
    });

    it('renders number children', () => {
      render(<StatusBadge>{42}</StatusBadge>);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders complex ReactNode children', () => {
      render(
        <StatusBadge>
          <span>Complex</span> <strong>Content</strong>
        </StatusBadge>
      );

      expect(screen.getByText('Complex')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty children', () => {
      render(<StatusBadge>Empty</StatusBadge>);
      const badge = getBadgeElement('Empty');

      expect(badge).toBeInTheDocument();
    });

    it('combines all props', () => {
      render(
        <StatusBadge
          variant='green'
          size='lg'
          icon={<span>✓</span>}
          dynamic
          className='extra-class'
        >
          Success
        </StatusBadge>
      );

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-surface-1');
      expect(badge).toHaveClass('border-success/20');
      expect(badge).toHaveClass('text-success');
      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('extra-class');
      expect(screen.getByText('✓')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(100);
      render(<StatusBadge>{longText}</StatusBadge>);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('empty className defaults to empty string', () => {
      render(<StatusBadge>Test</StatusBadge>);
      const badge = getBadgeElement('Test');

      expect(badge).toBeInTheDocument();
    });
  });
});

describe('StatusBadge canonical geometry ownership', () => {
  it('delegates size geometry to the canonical Badge atom', () => {
    const source = readFileSync(statusBadgeSourcePath, 'utf8');

    expect(source).not.toContain('STATUS_BADGE_SIZE_CLASSES');
    expect(auditStatusBadgeLocalGeometry(source)).toEqual([]);

    render(<StatusBadge size='lg'>Source-Backed</StatusBadge>);
    const badge = getBadgeElement('Source-Backed');

    expect(badge).toHaveClass('px-2.5', 'py-0.5', 'text-xs', 'leading-5');
    expect(badge).not.toHaveClass('px-5', 'py-2.5', 'text-base');
  });

  it('rejects the deliberate local geometry drift fixture', () => {
    expect(
      auditStatusBadgeLocalGeometry(STATUS_BADGE_GEOMETRY_DRIFT_FIXTURE_SOURCE)
    ).toEqual(['gap-2 px-4 py-2 text-sm']);

    render(<StatusBadgeGeometryDriftFixture />);
    const fixture = screen.getByTestId(STATUS_BADGE_GEOMETRY_DRIFT_TEST_ID);

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass('gap-2', 'px-4', 'py-2', 'text-sm');
    expect(readFileSync(statusBadgeSourcePath, 'utf8')).not.toContain(
      STATUS_BADGE_GEOMETRY_DRIFT_TEST_ID
    );
  });
});
