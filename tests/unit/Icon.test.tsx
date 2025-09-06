import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon, TypedIcon, createIconComponent } from '@/components/atoms/Icon';

// Mock the icon registry
vi.mock('@/lib/icons', () => ({
  getIcon: vi.fn((name: string) => {
    // Mock icon components for testing
    const mockIcons: Record<string, any> = {
      'chevron-right': ({ className, ...props }: any) => (
        <svg className={className} data-testid="chevron-right-icon" {...props}>
          <path d="mock-chevron-path" />
        </svg>
      ),
      'check': ({ className, ...props }: any) => (
        <svg className={className} data-testid="check-icon" {...props}>
          <path d="mock-check-path" />
        </svg>
      ),
    };
    return mockIcons[name];
  }),
  getIconSizeClasses: vi.fn((size?: string | number) => {
    if (typeof size === 'number') return `h-[${size}px] w-[${size}px]`;
    const sizeMap: Record<string, string> = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
      xl: 'h-8 w-8',
    };
    return sizeMap[size || 'md'];
  }),
  getSuggestedIcons: vi.fn(() => ['chevron-right', 'arrow-right']),
}));

describe('Icon Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset NODE_ENV for each test
    vi.stubEnv('NODE_ENV', 'test');
  });

  describe('Basic Functionality', () => {
    it('should render a valid icon', () => {
      render(<Icon name="chevron-right" />);
      expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
    });

    it('should apply default size classes', () => {
      render(<Icon name="chevron-right" />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveClass('h-5 w-5');
    });

    it('should apply custom size classes', () => {
      render(<Icon name="chevron-right" size="lg" />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveClass('h-6 w-6');
    });

    it('should apply custom className', () => {
      render(<Icon name="chevron-right" className="text-blue-500" />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveClass('text-blue-500');
    });

    it('should apply numeric size', () => {
      render(<Icon name="chevron-right" size={24} />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveClass('h-[24px] w-[24px]');
    });
  });

  describe('Accessibility', () => {
    it('should have aria-hidden="true" by default', () => {
      render(<Icon name="chevron-right" />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should allow custom aria-hidden', () => {
      render(<Icon name="chevron-right" aria-hidden={false} />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveAttribute('aria-hidden', 'false');
    });

    it('should apply aria-label when provided', () => {
      render(<Icon name="chevron-right" aria-label="Next page" />);
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveAttribute('aria-label', 'Next page');
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent icon in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { container } = render(<Icon name="non-existent-icon" />);
      expect(container.firstChild).toBeNull();
    });

    it('should show placeholder for non-existent icon in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      render(<Icon name="non-existent-icon" />);
      
      const placeholder = screen.getByTitle('Icon "non-existent-icon" not found');
      expect(placeholder).toBeInTheDocument();
      expect(placeholder).toHaveClass('border-dashed', 'border-red-300');
      expect(placeholder).toHaveTextContent('?');
    });

    it('should log warning for non-existent icon in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      render(<Icon name="non-existent-icon" />);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Icon "non-existent-icon" not found')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('TypedIcon Component', () => {
    it('should render with typed icon names', () => {
      render(<TypedIcon name="chevron-right" />);
      expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
    });

    it('should accept all typed icon props', () => {
      render(
        <TypedIcon 
          name="check" 
          size="lg" 
          className="text-green-500"
          aria-label="Success"
        />
      );
      
      const icon = screen.getByTestId('check-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('h-6 w-6', 'text-green-500');
      expect(icon).toHaveAttribute('aria-label', 'Success');
    });
  });

  describe('createIconComponent', () => {
    it('should create icon component with predefined props', () => {
      const CheckIcon = createIconComponent('check', { 
        size: 'sm', 
        className: 'text-green-500' 
      });
      
      render(<CheckIcon />);
      
      const icon = screen.getByTestId('check-icon');
      expect(icon).toHaveClass('h-4 w-4', 'text-green-500');
    });

    it('should allow prop overrides', () => {
      const CheckIcon = createIconComponent('check', { 
        size: 'sm', 
        className: 'text-green-500' 
      });
      
      render(<CheckIcon size="lg" className="text-red-500" />);
      
      const icon = screen.getByTestId('check-icon');
      expect(icon).toHaveClass('h-6 w-6', 'text-red-500');
    });
  });

  describe('Size Variants', () => {
    it('should handle all size variants', () => {
      const sizes = [
        { size: 'sm', expected: 'h-4 w-4' },
        { size: 'md', expected: 'h-5 w-5' },
        { size: 'lg', expected: 'h-6 w-6' },
        { size: 'xl', expected: 'h-8 w-8' },
      ] as const;

      sizes.forEach(({ size, expected }) => {
        const { unmount } = render(<Icon name="chevron-right" size={size} />);
        const icon = screen.getByTestId('chevron-right-icon');
        expect(icon).toHaveClass(expected);
        unmount();
      });
    });
  });

  describe('Props Forwarding', () => {
    it('should forward additional props to the icon component', () => {
      render(
        <Icon 
          name="chevron-right" 
          data-custom="test-value"
          onClick={() => {}}
        />
      );
      
      const icon = screen.getByTestId('chevron-right-icon');
      expect(icon).toHaveAttribute('data-custom', 'test-value');
    });
  });
});

