/**
 * CSV Export Tests - ExportCSVButton Component
 */
import {
  act,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mockUserColumns,
  mockUsers,
  type TestUser,
} from './csv-export.test-utils';

// Speed up waitFor calls with shorter timeout and interval
configure({ asyncUtilTimeout: 100 });

// Import components after mocks are set up
import { ExportCSVButton } from '@/components/organisms/table';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';

describe('ExportCSVButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default label', () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
        />
      );

      expect(
        screen.getByRole('button', { name: /export data to csv file/i })
      ).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    it('should render with custom label', () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
          label='Download Users'
        />
      );

      expect(screen.getByText('Download Users')).toBeInTheDocument();
    });

    it('should render download icon', () => {
      const { container } = render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
        />
      );

      // Check for SVG (lucide Download icon)
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
          className='custom-class'
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should have correct aria-label', () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
          ariaLabel='Export user data'
        />
      );

      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Export user data'
      );
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
          disabled
        />
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should not trigger export when disabled', async () => {
      const getData = vi.fn().mockReturnValue(mockUsers);

      render(
        <ExportCSVButton
          getData={getData}
          columns={mockUserColumns}
          filename='users'
          disabled
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(getData).not.toHaveBeenCalled();
      });
    });
  });

  describe('Export Behavior', () => {
    it('should call getData and trigger download on click', async () => {
      const getData = vi.fn().mockReturnValue(mockUsers);

      render(
        <ExportCSVButton
          getData={getData}
          columns={mockUserColumns}
          filename='users'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(getData).toHaveBeenCalledTimes(1);
        expect(downloadCSVBlob).toHaveBeenCalled();
      });
    });

    it('should show loading state during export', async () => {
      // Create a delayed promise to simulate async data fetching
      let resolvePromise: (value: TestUser[]) => void;
      const getData = vi.fn().mockImplementation(
        () =>
          new Promise<TestUser[]>(resolve => {
            resolvePromise = resolve;
          })
      );

      render(
        <ExportCSVButton
          getData={getData}
          columns={mockUserColumns}
          filename='users'
        />
      );

      // Click the button
      fireEvent.click(screen.getByRole('button'));

      // Should show loading text
      await waitFor(() => {
        expect(screen.getByText('Exporting...')).toBeInTheDocument();
      });

      // Button should have aria-busy attribute
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');

      // Resolve the promise
      await act(async () => {
        resolvePromise(mockUsers);
      });

      // Should return to normal state
      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });
    });

    it('should handle async getData', async () => {
      const asyncGetData = vi.fn().mockResolvedValue(mockUsers);

      render(
        <ExportCSVButton
          getData={asyncGetData}
          columns={mockUserColumns}
          filename='users'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(asyncGetData).toHaveBeenCalled();
        expect(downloadCSVBlob).toHaveBeenCalled();
      });
    });

    it('should generate timestamped filename', async () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='test-export'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(generateTimestampedFilename).toHaveBeenCalledWith(
          'test-export',
          'csv'
        );
      });
    });

    it('should pass correct Blob to download', async () => {
      render(
        <ExportCSVButton
          getData={() => mockUsers}
          columns={mockUserColumns}
          filename='users'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(downloadCSVBlob).toHaveBeenCalled();
        const call = vi.mocked(downloadCSVBlob).mock.calls[0];
        expect(call[0]).toBeInstanceOf(Blob);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle empty data gracefully', async () => {
      useNotifications();

      render(
        <ExportCSVButton
          getData={() => []}
          columns={mockUserColumns}
          filename='users'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        // Should not call download with empty data
        expect(downloadCSVBlob).not.toHaveBeenCalled();
      });
    });

    it('should handle getData error', async () => {
      const getData = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      render(
        <ExportCSVButton
          getData={getData}
          columns={mockUserColumns}
          filename='users'
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        // Download should not be called
        expect(downloadCSVBlob).not.toHaveBeenCalled();
      });

      // Button should return to normal state
      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
        expect(screen.getByRole('button')).not.toBeDisabled();
      });
    });
  });

  describe('Button Variants', () => {
    it('should accept different variants', () => {
      const { rerender } = render(
        <ExportCSVButton
          getData={() => mockUsers}
          filename='users'
          variant='secondary'
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();

      rerender(
        <ExportCSVButton
          getData={() => mockUsers}
          filename='users'
          variant='outline'
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();

      rerender(
        <ExportCSVButton
          getData={() => mockUsers}
          filename='users'
          variant='ghost'
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should accept different sizes', () => {
      const { rerender } = render(
        <ExportCSVButton getData={() => mockUsers} filename='users' size='sm' />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();

      rerender(
        <ExportCSVButton
          getData={() => mockUsers}
          filename='users'
          size='default'
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();

      rerender(
        <ExportCSVButton getData={() => mockUsers} filename='users' size='lg' />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
