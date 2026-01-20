/**
 * Unit tests for IngestedSuggestions component - rendering
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './IngestedSuggestions.test-utils';

import { IngestedSuggestions } from '@/components/dashboard/organisms/links/IngestedSuggestions';
import {
  createMockCallbacks,
  createMockSuggestion,
} from './IngestedSuggestions.test-utils';

describe('IngestedSuggestions - rendering', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render suggestions container with aria-label', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(
      screen.getByLabelText('Ingested link suggestions')
    ).toBeInTheDocument();
  });

  it('should render multiple suggestions', () => {
    const suggestions = [
      createMockSuggestion('instagram'),
      createMockSuggestion('tiktok'),
      createMockSuggestion('twitter'),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getAllByTestId('ingested-suggestion-pill')).toHaveLength(3);
  });

  it('should not render when suggestions array is empty', () => {
    const { container } = render(
      <IngestedSuggestions
        suggestions={[]}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should apply custom className', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
        className='custom-class'
      />
    );

    const container = screen.getByLabelText('Ingested link suggestions');
    expect(container).toHaveClass('custom-class');
  });

  it('should display platform name and identity in pill', () => {
    const suggestions = [
      createMockSuggestion('instagram', {
        normalizedUrl: 'https://instagram.com/testartist',
      }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const pill = screen.getByTestId('ingested-suggestion-pill');
    expect(pill).toHaveTextContent('Instagram');
    expect(pill).toHaveTextContent('@testartist');
  });

  it('should show Suggested badge', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByText('Suggested')).toBeInTheDocument();
  });

  it('should render dismiss button with correct aria-label', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(
      screen.getByLabelText('Dismiss Instagram suggestion')
    ).toBeInTheDocument();
  });
});
